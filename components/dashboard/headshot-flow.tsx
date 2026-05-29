"use client";

/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, ExternalLink, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_PHOTOS = 10;
const MAX_PHOTOS = 15;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 8000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type StyleOption = {
  label: string;
  value: "professional" | "cinematic" | "natural";
  description: string;
};

type JobStatus = "pending" | "processing" | "done" | "failed";

type HeadshotJob = {
  id: string;
  type?: string;
  status: JobStatus;
  result: string[] | { lora_url?: string; trigger_word?: string } | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

const STYLE_OPTIONS: StyleOption[] = [
  {
    label: "Profesional",
    value: "professional",
    description: "Fondo neutro, iluminación de estudio. Ideal para LinkedIn y CV."
  },
  {
    label: "Cinematográfico",
    value: "cinematic",
    description: "Estilo editorial con mayor contraste. Para perfiles creativos."
  },
  {
    label: "Natural",
    value: "natural",
    description: "Sin filtros adicionales. El resultado más cercano a tus fotos originales."
  }
];

const IMAGE_COUNTS = [1, 2, 4] as const;

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes} min ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function readJsonOrText(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

export function HeadshotFlow() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[] | null>(null);
  const [style, setStyle] = useState<StyleOption["value"]>("professional");
  const [numImages, setNumImages] = useState<(typeof IMAGE_COUNTS)[number]>(4);
  const [uploading, setUploading] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStartedAt, setJobStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<string[] | null>(null);
  const [galleryJobId, setGalleryJobId] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [previousJobs, setPreviousJobs] = useState<HeadshotJob[]>([]);
  const [savedModelJob, setSavedModelJob] = useState<HeadshotJob | null>(null);
  const [loadingPreviousJobs, setLoadingPreviousJobs] = useState(false);
  const [previousMessage, setPreviousMessage] = useState<string | null>(null);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    };
  }, []);

  const loadPreviousJobs = useCallback(async () => {
    setLoadingPreviousJobs(true);
    try {
      console.log("[headshot-flow] previous jobs: loading jobs and saved model");
      const [generatedResponse, trainingResponse] = await Promise.all([
        fetch("/api/jobs?type=headshot-generate&limit=5"),
        fetch("/api/jobs?type=headshot-training&limit=10")
      ]);
      const generatedData = await generatedResponse.json();
      const trainingData = await trainingResponse.json();
      console.log("[headshot-flow] previous jobs response:", generatedResponse.status, generatedData);
      console.log("[headshot-flow] saved model response:", trainingResponse.status, trainingData);
      if (!generatedResponse.ok) {
        setPreviousMessage(generatedData.error ?? "No pudimos cargar las sesiones anteriores.");
        return;
      }

      if (!trainingResponse.ok) {
        setPreviousMessage(trainingData.error ?? "No pudimos cargar tu modelo guardado.");
        return;
      }

      setPreviousJobs(generatedData.jobs ?? []);
      setSavedModelJob(
        (trainingData.jobs as HeadshotJob[] | undefined)?.find(
          (job) => job.status === "done" && job.result && !Array.isArray(job.result) && job.result.lora_url && job.result.trigger_word
        ) ?? null
      );
      setPreviousMessage(null);
    } catch (error) {
      console.error("[headshot-flow] previous jobs failed:", error);
      setPreviousMessage("No pudimos cargar las sesiones anteriores.");
    } finally {
      setLoadingPreviousJobs(false);
    }
  }, []);

  const loadSignedUrls = useCallback(async (id: string) => {
    console.log("[headshot-flow] signed urls: loading", { jobId: id });
    const response = await fetch(`/api/jobs/${id}/signed-urls`, { method: "POST" });
    const data = await response.json();
    console.log("[headshot-flow] signed urls response:", response.status, data);
    if (!response.ok) throw new Error(data.error ?? "No pudimos cargar las fotos.");
    setSignedUrls(data.signedUrls);
    setGalleryJobId(id);
    setSelectedImageUrl(null);
    return data.signedUrls as string[];
  }, []);

  const createJob = useCallback(async (payload: { type: "headshot-training" | "headshot-generate"; input: Record<string, unknown> }) => {
    console.log("[headshot-flow] create job: request", {
      type: payload.type,
      input: {
        ...payload.input,
        archive_url: typeof payload.input.archive_url === "string" ? `[${payload.input.archive_url.length} chars]` : payload.input.archive_url,
        lora_url: typeof payload.input.lora_url === "string" ? "[redacted]" : payload.input.lora_url
      }
    });
    const response = await fetch("/api/jobs/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log("[headshot-flow] create job response:", response.status, data);

    if (response.status === 402) {
      throw new Error("No tenés créditos suficientes. Comprá un pack para continuar.");
    }

    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "No pudimos crear el job.");
    }

    return data.jobId as string;
  }, []);

  const createGenerationJob = useCallback(async (trainingJob: HeadshotJob) => {
    console.log("[headshot-flow] generation: preparing from training result", {
      trainingJobId: trainingJob.id,
      result: trainingJob.result
    });
    if (!trainingJob.result || Array.isArray(trainingJob.result)) {
      throw new Error("El training terminó sin datos de LoRA.");
    }

    const { lora_url: loraUrl, trigger_word: triggerWord } = trainingJob.result;
    if (!loraUrl || !triggerWord) {
      throw new Error("El training terminó sin URL de LoRA o trigger word.");
    }

    const generationJobId = await createJob({
      type: "headshot-generate",
      input: {
        lora_url: loraUrl,
        trigger_word: triggerWord,
        style,
        num_images: numImages
      }
    });

    console.log("[headshot-flow] generation: job created", { generationJobId });
    setJobId(generationJobId);
    setJobStartedAt(Date.now());
    setJobStatus("pending");
    setJobError(null);
    setElapsedSeconds(0);
    await loadPreviousJobs();
  }, [createJob, loadPreviousJobs, numImages, style]);

  const pollJob = useCallback(async (id: string) => {
    console.log("[headshot-flow] poll: request", { jobId: id });
    const response = await fetch(`/api/jobs/${id}`);
    const data = await response.json();
    console.log("[headshot-flow] poll response:", response.status, data);
    if (!response.ok) throw new Error(data.error ?? "No pudimos consultar el estado del job.");

    const job = data as HeadshotJob;
    setJobStatus(job.status);
    setJobError(job.error);

    if (job.status === "done") {
      if (job.type === "headshot-training") {
        console.log("[headshot-flow] poll: training done, creating generation job", { trainingJobId: job.id });
        await createGenerationJob(job);
        return;
      }

      console.log("[headshot-flow] poll: generation done, loading signed urls", { generationJobId: id });
      await loadSignedUrls(id);
      await loadPreviousJobs();
      return;
    }

    if (job.status === "failed") {
      await loadPreviousJobs();
    }
  }, [createGenerationJob, loadPreviousJobs, loadSignedUrls]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPreviousJobs();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPreviousJobs]);

  useEffect(() => {
    if (!jobId || signedUrls || jobStatus === "failed") return;

    const timeoutId = window.setTimeout(() => {
      void pollJob(jobId).catch((error) => {
        setJobError(error instanceof Error ? error.message : "No pudimos consultar el estado del job.");
      });
    }, 0);

    const intervalId = window.setInterval(() => {
      void pollJob(jobId).catch((error) => {
        setJobError(error instanceof Error ? error.message : "No pudimos consultar el estado del job.");
      });
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [jobId, jobStatus, pollJob, signedUrls]);

  useEffect(() => {
    if (!jobStartedAt || signedUrls || jobStatus === "failed") return;

    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - jobStartedAt) / 1000)));
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [jobStartedAt, jobStatus, signedUrls]);

  const canContinue = photos.length >= MIN_PHOTOS && !uploading && !uploadedUrls && !jobId && !signedUrls && !savedModelJob;
  const canChooseGenerationOptions = Boolean(savedModelJob || uploadedUrls);
  const uploadHelp = useMemo(() => {
    if (photos.length === 0) return "Todavía no seleccionaste fotos.";
    if (photos.length < MIN_PHOTOS) return `Agregá ${MIN_PHOTOS - photos.length} foto${MIN_PHOTOS - photos.length === 1 ? "" : "s"} más para continuar.`;
    return "Listo para subir.";
  }, [photos.length]);

  function addFiles(fileList: FileList | File[]) {
    setMessage(null);
    const nextFiles = Array.from(fileList).filter((file) => ALLOWED_TYPES.has(file.type));
    const accepted: SelectedPhoto[] = [];
    const errors: string[] = [];

    for (const file of nextFiles) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name} supera el límite de 10MB.`);
        continue;
      }

      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file)
      });
    }

    const availableSlots = MAX_PHOTOS - photos.length;
    const photosToAdd = accepted.slice(0, Math.max(availableSlots, 0));
    const skippedByLimit = accepted.length - photosToAdd.length;

    for (const photo of accepted.slice(photosToAdd.length)) {
      URL.revokeObjectURL(photo.previewUrl);
    }

    const nextMessage = skippedByLimit > 0 ? `Solo podés subir hasta ${MAX_PHOTOS} fotos.` : errors[0] ?? null;
    setPhotos((current) => [...current, ...photosToAdd]);
    if (nextMessage) setMessage(nextMessage);
  }

  function resetFlow() {
    for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    photosRef.current = [];
    setPhotos([]);
    setUploadedUrls(null);
    setStyle("professional");
    setNumImages(4);
    setUploading(false);
    setCreatingJob(false);
    setMessage(null);
    setJobId(null);
    setJobStartedAt(null);
    setElapsedSeconds(0);
    setJobStatus(null);
    setJobError(null);
    setSignedUrls(null);
    setGalleryJobId(null);
    setSelectedImageUrl(null);
  }

  function removePhoto(id: string) {
    setMessage(null);
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  async function uploadPhotos() {
    if (photos.length < MIN_PHOTOS) {
      setMessage(`Subí al menos ${MIN_PHOTOS} fotos para continuar.`);
      return;
    }

    setUploading(true);
    setMessage("Subiendo fotos...");
    console.log("[headshot-flow] upload: starting", {
      count: photos.length,
      files: photos.map((photo) => ({ name: photo.file.name, size: photo.file.size, type: photo.file.type }))
    });

    try {
      const urls = await Promise.all(
        photos.map(async (photo, index) => {
          console.log("[headshot-flow] upload: initiating fal upload", {
            index,
            name: photo.file.name,
            size: photo.file.size,
            type: photo.file.type
          });

          const initiateResponse = await fetch("/api/upload/initiate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: photo.file.name,
              contentType: photo.file.type,
              size: photo.file.size
            })
          });
          const initiateData = await readJsonOrText(initiateResponse) as { uploadUrl?: string; fileUrl?: string; error?: string } | null;
          console.log("[headshot-flow] upload initiate response:", initiateResponse.status, initiateData);

          if (!initiateResponse.ok || !initiateData?.uploadUrl || !initiateData.fileUrl) {
            throw new Error(initiateData?.error ?? `No pudimos preparar la subida de ${photo.file.name}.`);
          }

          const uploadResponse = await fetch(initiateData.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": photo.file.type || "application/octet-stream" },
            body: photo.file
          });
          console.log("[headshot-flow] fal upload response:", uploadResponse.status, {
            index,
            fileUrl: initiateData.fileUrl
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(errorText || `No pudimos subir ${photo.file.name}.`);
          }

          return initiateData.fileUrl;
        })
      );

      setUploadedUrls(urls);
      console.log("[headshot-flow] upload complete:", { count: urls.length, urls });
      setMessage(null);
    } catch (error) {
      console.error("[headshot-flow] upload failed:", error);
      setMessage("No pudimos subir las fotos. Probá de nuevo.");
    } finally {
      setUploading(false);
    }
  }

  async function createHeadshotJob() {
    if (!savedModelJob && !uploadedUrls) return;

    setCreatingJob(true);
    setMessage(null);
    console.log("[headshot-flow] headshot job: starting", {
      mode: savedModelJob ? "generate-from-saved-model" : "train-then-generate",
      uploadedUrlCount: uploadedUrls?.length ?? 0,
      savedModelJobId: savedModelJob?.id ?? null,
      style,
      numImages
    });

    try {
      if (savedModelJob) {
        console.log("[headshot-flow] saved model: skipping training", { trainingJobId: savedModelJob.id });
        await createGenerationJob(savedModelJob);
        return;
      }

      if (!uploadedUrls) {
        throw new Error("Subí tus fotos para entrenar el modelo.");
      }

      const trainingJobId = await createJob({
        type: "headshot-training",
        input: {
          archive_url: JSON.stringify(uploadedUrls),
          steps: 1000
        }
      });

      setJobId(trainingJobId);
      console.log("[headshot-flow] training: job created", { trainingJobId });
      setJobStartedAt(Date.now());
      setJobStatus("pending");
      setElapsedSeconds(0);
      await loadPreviousJobs();
    } catch (error) {
      console.error("[headshot-flow] training/create failed:", error);
      setMessage(error instanceof Error ? error.message : "No pudimos crear el job. Probá de nuevo.");
    } finally {
      setCreatingJob(false);
    }
  }

  async function showPreviousJob(job: HeadshotJob) {
    setPreviousMessage(null);
    try {
      if (job.status === "done") {
        await loadSignedUrls(job.id);
        setJobId(null);
        setJobStatus(null);
        setJobError(null);
        setJobStartedAt(null);
        setElapsedSeconds(0);
        return;
      }

      if (job.status === "pending" || job.status === "processing") {
        setSignedUrls(null);
        setGalleryJobId(null);
        setJobId(job.id);
        setJobStartedAt(new Date(job.createdAt).getTime());
        setJobStatus(job.status);
        setJobError(null);
        return;
      }

      setPreviousMessage(job.error ?? "La sesión falló.");
    } catch (error) {
      setPreviousMessage(error instanceof Error ? error.message : "No pudimos cargar esa sesión.");
    }
  }

  function renderMainFlow() {
    if (signedUrls?.length) {
      return (
        <HeadshotGallery
          urls={signedUrls}
          jobId={galleryJobId}
          selectedImageUrl={selectedImageUrl}
          onSelectImage={setSelectedImageUrl}
          onCloseImage={() => setSelectedImageUrl(null)}
          onReset={resetFlow}
        />
      );
    }

    if (jobId) {
      if (jobStatus === "failed") {
        return (
          <section className="rounded-lg border bg-card p-6">
            <div className="flex max-w-2xl flex-col gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <X className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">No pudimos generar tus headshots.</h1>
                <p className="mt-2 text-sm text-muted-foreground">{jobError ?? "El job falló. Te devolvimos los créditos si correspondía."}</p>
              </div>
              <div className="rounded-md border bg-background p-3 text-sm">
                <span className="text-muted-foreground">Job ID: </span>
                <code>{jobId}</code>
              </div>
              <Button type="button" onClick={resetFlow} className="w-fit">
                <RefreshCw className="h-4 w-4" />
                Intentar de nuevo
              </Button>
            </div>
          </section>
        );
      }

      return (
        <section className="rounded-lg border bg-card p-6">
          <div className="flex max-w-2xl flex-col gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Generando tus headshots...</h1>
              <p className="mt-2 text-muted-foreground">Esto puede tardar entre 5 y 15 minutos.</p>
            </div>
            <div className="rounded-md border bg-background p-3 text-sm">
              <div><span className="text-muted-foreground">Estado: </span>{jobStatus ?? "pending"}</div>
              <div><span className="text-muted-foreground">Tiempo: </span>{formatElapsed(elapsedSeconds)}</div>
              <div><span className="text-muted-foreground">Job ID: </span><code>{jobId}</code></div>
            </div>
            {jobError ? <p className="text-sm text-destructive">{jobError}</p> : null}
            <p className="text-sm text-muted-foreground">Te avisaremos por email cuando estén listos.</p>
          </div>
        </section>
      );
    }

    return (
      <div className="space-y-6">
        {!savedModelJob ? (
          <section className="rounded-lg border bg-card p-5">
            <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <h1 className="text-2xl font-semibold">Headshots AI</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Subí entre 5 y 15 fotos tuyas. Usá fotos de distintos ángulos, con buena luz y sin anteojos de sol. Cuantas más fotos, mejor resultado.
                </p>
              </div>
              <span className="rounded-md border px-3 py-1 text-sm font-medium">{photos.length} / {MAX_PHOTOS} fotos</span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(event.dataTransfer.files);
              }}
              disabled={uploading || Boolean(uploadedUrls)}
              className="flex min-h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed bg-background px-6 py-8 text-center transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Arrastrá tus fotos o hacé click para elegirlas</span>
              <span className="mt-1 text-xs text-muted-foreground">JPG, JPEG o PNG. Máximo 10MB por archivo.</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />

            {photos.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                    <Image src={photo.previewUrl} alt="" fill unoptimized className="object-cover" />
                    {!uploadedUrls ? (
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
                        aria-label="Eliminar foto"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              {canContinue ? (
                <Button type="button" onClick={uploadPhotos} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {uploading ? "Subiendo fotos..." : "Continuar"}
                </Button>
              ) : null}
              <p className={cn("text-sm", message ? "text-destructive" : "text-muted-foreground")}>
                {message ?? uploadHelp}
              </p>
            </div>
          </section>
        ) : null}

        {canChooseGenerationOptions ? (
          <section className="rounded-lg border bg-card p-5">
            <div className="mb-5">
              <h2 className="text-2xl font-semibold">Elegí el estilo</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {savedModelJob ? "Vamos a usar tu modelo guardado y generar nuevas fotos." : `${uploadedUrls?.length ?? 0} fotos subidas correctamente.`}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStyle(option.value)}
                  className={cn(
                    "rounded-lg border bg-background p-4 text-left transition-colors hover:bg-muted",
                    style === option.value && "border-primary ring-2 ring-primary/20"
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium">{option.label}</span>
                    {style === option.value ? <Check className="h-4 w-4 text-primary" /> : null}
                  </span>
                  <span className="mt-2 block text-sm text-muted-foreground">{option.description}</span>
                </button>
              ))}
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-medium">Cantidad</h3>
              <div className="mt-2 inline-flex rounded-md border bg-background p-1">
                {IMAGE_COUNTS.map((count) => (
                  <Button
                    key={count}
                    type="button"
                    size="sm"
                    variant={numImages === count ? "default" : "ghost"}
                    onClick={() => setNumImages(count)}
                  >
                    {count} fotos
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="button" onClick={createHeadshotJob} disabled={creatingJob}>
                {creatingJob ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {creatingJob ? "Creando job..." : "Generar mis headshots"}
              </Button>
              {message ? (
                message.startsWith("No tenés créditos") ? (
                  <div className="flex flex-col gap-2 text-sm text-destructive sm:flex-row sm:items-center">
                    <span>{message}</span>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/pricing">Comprar créditos</Link>
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-destructive">{message}</p>
                )
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {renderMainFlow()}
      <PreviousSessions
        jobs={previousJobs}
        loading={loadingPreviousJobs}
        message={previousMessage}
        currentJobId={jobId}
        galleryJobId={galleryJobId}
        onRefresh={loadPreviousJobs}
        onOpenJob={showPreviousJob}
      />
    </div>
  );
}

function HeadshotGallery({
  urls,
  jobId,
  selectedImageUrl,
  onSelectImage,
  onCloseImage,
  onReset
}: {
  urls: string[];
  jobId: string | null;
  selectedImageUrl: string | null;
  onSelectImage: (url: string) => void;
  onCloseImage: () => void;
  onReset: () => void;
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-semibold">¡Tus headshots están listos! 🎉</h1>
          {jobId ? <p className="mt-1 text-sm text-muted-foreground">Job ID: <code>{jobId}</code></p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => urls.forEach((url, index) => downloadUrl(url, `headshot-${index + 1}.jpg`))}
          >
            <Download className="h-4 w-4" />
            Descargar todas
          </Button>
          <Button type="button" variant="outline" onClick={onReset}>
            <RefreshCw className="h-4 w-4" />
            Generar nueva sesión
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {urls.map((url, index) => (
          <div key={url} className="overflow-hidden rounded-lg border bg-background">
            <button type="button" onClick={() => onSelectImage(url)} className="relative block aspect-square w-full bg-muted">
              <img src={url} alt={`Headshot ${index + 1}`} className="h-full w-full object-cover transition-opacity hover:opacity-90" />
            </button>
            <div className="flex items-center justify-between gap-2 p-3">
              <span className="text-sm font-medium">Headshot {index + 1}</span>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => onSelectImage(url)} aria-label="Ver en grande">
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => downloadUrl(url, `headshot-${index + 1}.jpg`)} aria-label="Descargar">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedImageUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={onCloseImage}
        >
          <div className="relative max-h-[90vh] max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={onCloseImage}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow-sm hover:bg-background"
              aria-label="Cerrar imagen"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={selectedImageUrl} alt="Headshot seleccionado" className="max-h-[90vh] rounded-lg object-contain" />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PreviousSessions({
  jobs,
  loading,
  message,
  currentJobId,
  galleryJobId,
  onRefresh,
  onOpenJob
}: {
  jobs: HeadshotJob[];
  loading: boolean;
  message: string | null;
  currentJobId: string | null;
  galleryJobId: string | null;
  onRefresh: () => void;
  onOpenJob: (job: HeadshotJob) => void;
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Sesiones anteriores</h2>
          <p className="mt-1 text-sm text-muted-foreground">Últimos 5 jobs de headshots.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      {message ? <p className="mb-3 text-sm text-destructive">{message}</p> : null}

      {!jobs.length && !loading ? (
        <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">Todavía no hay sesiones de headshots.</div>
      ) : null}

      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={job.id} className="flex flex-col gap-3 rounded-md border bg-background p-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{new Date(job.createdAt).toLocaleString()}</span>
                <span className="rounded-md border px-2 py-1 text-xs capitalize">{job.status}</span>
                {job.id === currentJobId || job.id === galleryJobId ? <span className="text-xs text-primary">Sesión actual</span> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground"><code>{job.id}</code></p>
            </div>
            <div className="flex flex-wrap gap-2">
              {job.status === "done" ? (
                <Button type="button" size="sm" onClick={() => onOpenJob(job)}>
                  Ver fotos
                </Button>
              ) : null}
              {job.status === "pending" || job.status === "processing" ? (
                <Button type="button" size="sm" variant="outline" onClick={() => onOpenJob(job)}>
                  Ver progreso
                </Button>
              ) : null}
              {job.status === "failed" ? <span className="text-sm text-destructive">{job.error ?? "Falló"}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
