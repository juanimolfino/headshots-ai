"use client";

/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, ExternalLink, Loader2, Plus, RefreshCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_PHOTOS = 10;
const MAX_PHOTOS = 15;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 8000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_UPLOAD_DIMENSION = 1024;
const UPLOAD_JPEG_QUALITY = 0.88;

type StyleValue = "professional" | "cinematic" | "natural";
type JobStatus = "pending" | "processing" | "done" | "failed";

type HeadshotJob = {
  id: string;
  type?: string;
  status: JobStatus;
  input: Record<string, unknown> | null;
  result: string[] | { lora_url?: string; trigger_word?: string } | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type SelectedPhoto = { id: string; file: File; previewUrl: string };

const STYLE_OPTIONS: { label: string; value: StyleValue; description: string }[] = [
  { label: "Profesional", value: "professional", description: "Fondo neutro, iluminación de estudio. Ideal para LinkedIn y CV." },
  { label: "Cinematográfico", value: "cinematic", description: "Estilo editorial con mayor contraste. Para perfiles creativos." },
  { label: "Natural", value: "natural", description: "Sin filtros adicionales. El resultado más cercano a tus fotos originales." }
];

const IMAGE_COUNTS = [1, 2, 4] as const;

function getModelName(job: HeadshotJob): string {
  const name = job.input?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return `Modelo ${new Date(job.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}`;
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m === 0 ? `${s}s` : `${m} min ${String(s).padStart(2, "0")}s`;
}

async function downloadUrl(url: string, filename: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

async function downloadAll(urls: string[]) {
  for (let i = 0; i < urls.length; i++) {
    await downloadUrl(urls[i], `headshot-${i + 1}.jpg`);
  }
}

async function readJsonOrText(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return { error: text }; }
}

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
          resolve(compressed.size < file.size ? compressed : file);
        },
        "image/jpeg",
        UPLOAD_JPEG_QUALITY
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error(`Could not load ${file.name}`)); };
    img.src = objectUrl;
  });
}

export function HeadshotFlow() {
  // Models
  const [trainedModels, setTrainedModels] = useState<HeadshotJob[]>([]);
  const [activeTrainingJob, setActiveTrainingJob] = useState<HeadshotJob | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [trainingElapsed, setTrainingElapsed] = useState(0);
  const trainingStartRef = useRef<number | null>(null);

  // New model form
  const [showNewModelForm, setShowNewModelForm] = useState(false);
  const [modelName, setModelName] = useState("");
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [trainingCreating, setTrainingCreating] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);

  // Generation
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [style, setStyle] = useState<StyleValue>("professional");
  const [numImages, setNumImages] = useState<(typeof IMAGE_COUNTS)[number]>(4);
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<JobStatus | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<string[] | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const generationStartRef = useRef<number | null>(null);
  const [generationElapsed, setGenerationElapsed] = useState(0);

  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => {
    return () => { for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl); };
  }, []);

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?type=headshot-training&limit=20");
      if (!res.ok) return;
      const data = await res.json() as { jobs?: HeadshotJob[] };
      const all = data.jobs ?? [];
      setTrainedModels(all.filter(j => {
        if (j.status !== "done") return false;
        const r = j.result;
        return r && !Array.isArray(r) && r.lora_url && r.trigger_word;
      }));
      const active = all.find(j => j.status === "pending" || j.status === "processing") ?? null;
      setActiveTrainingJob(prev => {
        if (active && !trainingStartRef.current) {
          trainingStartRef.current = new Date(active.createdAt).getTime();
        }
        if (!active) trainingStartRef.current = null;
        return active;
      });
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  // Poll while training active
  useEffect(() => {
    if (!activeTrainingJob) return;
    const id = setInterval(loadModels, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeTrainingJob, loadModels]);

  // Training elapsed timer
  useEffect(() => {
    if (!activeTrainingJob) return;
    const tick = () => {
      if (trainingStartRef.current) setTrainingElapsed(Math.floor((Date.now() - trainingStartRef.current) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTrainingJob]);

  // Poll while generation running
  useEffect(() => {
    if (!generationJobId || signedUrls || generationStatus === "failed") return;
    const poll = async () => {
      const res = await fetch(`/api/jobs/${generationJobId}`);
      const data = await res.json() as HeadshotJob;
      setGenerationStatus(data.status);
      setGenerationError(data.error);
      if (data.status === "done") {
        const sRes = await fetch(`/api/jobs/${generationJobId}/signed-urls`, { method: "POST" });
        const sData = await sRes.json() as { signedUrls?: string[] };
        setSignedUrls(sData.signedUrls ?? []);
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [generationJobId, generationStatus, signedUrls]);

  // Generation elapsed timer
  useEffect(() => {
    if (!generationJobId || signedUrls || generationStatus === "failed") return;
    const tick = () => {
      if (generationStartRef.current) setGenerationElapsed(Math.floor((Date.now() - generationStartRef.current) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [generationJobId, generationStatus, signedUrls]);

  // ── Photo management ───────────────────────────────────────────────────────

  function addFiles(fileList: FileList | File[]) {
    setFormMessage(null);
    const errors: string[] = [];
    const accepted: SelectedPhoto[] = [];
    for (const file of Array.from(fileList)) {
      if (!ALLOWED_TYPES.has(file.type)) continue;
      if (file.size > MAX_FILE_SIZE_BYTES) { errors.push(`${file.name} supera 10MB.`); continue; }
      accepted.push({ id: `${file.name}-${file.size}-${crypto.randomUUID()}`, file, previewUrl: URL.createObjectURL(file) });
    }
    const slots = MAX_PHOTOS - photos.length;
    const toAdd = accepted.slice(0, Math.max(slots, 0));
    for (const p of accepted.slice(toAdd.length)) URL.revokeObjectURL(p.previewUrl);
    const skipped = accepted.length - toAdd.length;
    setPhotos(prev => [...prev, ...toAdd]);
    if (skipped > 0) setFormMessage(`Solo podés subir hasta ${MAX_PHOTOS} fotos.`);
    else if (errors[0]) setFormMessage(errors[0]);
  }

  function removePhoto(id: string) {
    setPhotos(prev => {
      const p = prev.find(x => x.id === id);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  }

  // ── Upload photos ──────────────────────────────────────────────────────────

  async function uploadPhotos() {
    if (photos.length < MIN_PHOTOS) { setFormMessage(`Subí al menos ${MIN_PHOTOS} fotos.`); return; }
    setUploading(true);
    setFormMessage(null);
    try {
      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        setFormMessage(`Subiendo foto ${i + 1} de ${photos.length}...`);
        const file = await compressImage(photos[i].file);
        const initRes = await fetch("/api/upload/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size })
        });
        const initData = await readJsonOrText(initRes) as { uploadUrl?: string; fileUrl?: string; error?: string } | null;
        if (!initRes.ok || !initData?.uploadUrl || !initData.fileUrl) {
          throw new Error(initData?.error ?? `No pudimos preparar la subida de ${photos[i].file.name}.`);
        }
        const upRes = await fetch(initData.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!upRes.ok) throw new Error(`No pudimos subir ${photos[i].file.name}.`);
        urls.push(initData.fileUrl);
      }
      setUploadedUrls(urls);
      setFormMessage(null);
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "No pudimos subir las fotos. Probá de nuevo.");
    } finally {
      setUploading(false);
    }
  }

  // ── Create training job ────────────────────────────────────────────────────

  async function startTraining() {
    if (!uploadedUrls) return;
    if (!modelName.trim()) { setFormMessage("Dale un nombre a tu modelo."); return; }
    setTrainingCreating(true);
    setFormMessage(null);
    try {
      const res = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "headshot-training",
          input: { archive_url: JSON.stringify(uploadedUrls), steps: 1000, name: modelName.trim() }
        })
      });
      const data = await res.json() as { jobId?: string; error?: string };
      if (res.status === 402) throw new Error("No tenés créditos suficientes.");
      if (!res.ok) throw new Error(data.error ?? "No pudimos iniciar el entrenamiento.");
      // Reset form
      for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl);
      setPhotos([]);
      setUploadedUrls(null);
      setModelName("");
      setShowNewModelForm(false);
      trainingStartRef.current = Date.now();
      await loadModels();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "No pudimos iniciar el entrenamiento.");
    } finally {
      setTrainingCreating(false);
    }
  }

  // ── Create generation job ──────────────────────────────────────────────────

  async function startGeneration() {
    const model = trainedModels.find(m => m.id === selectedModelId);
    if (!model) return;
    const r = model.result as { lora_url?: string; trigger_word?: string } | null;
    if (!r?.lora_url || !r?.trigger_word) return;

    setGenerationMessage(null);
    const res = await fetch("/api/jobs/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "headshot-generate",
        input: { lora_url: r.lora_url, trigger_word: r.trigger_word, style, num_images: numImages }
      })
    });
    const data = await res.json() as { jobId?: string; error?: string };
    if (res.status === 402) { setGenerationMessage("No tenés créditos suficientes."); return; }
    if (!res.ok) { setGenerationMessage(data.error ?? "No pudimos iniciar la generación."); return; }
    generationStartRef.current = Date.now();
    setGenerationJobId(data.jobId!);
    setGenerationStatus("pending");
    setGenerationError(null);
    setSignedUrls(null);
    setGenerationElapsed(0);
  }

  function resetGeneration() {
    setGenerationJobId(null);
    setGenerationStatus(null);
    setGenerationError(null);
    setSignedUrls(null);
    setSelectedImageUrl(null);
    setGenerationElapsed(0);
    generationStartRef.current = null;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedModel = trainedModels.find(m => m.id === selectedModelId) ?? null;

  return (
    <div className="space-y-6">
      {/* STAGE 1 — Tus modelos */}
      <section className="rounded-lg border bg-card p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Tus modelos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada modelo se entrena con tus fotos y podés reutilizarlo para generar headshots cuantas veces quieras.
            </p>
          </div>
          <Button type="button" onClick={() => { setShowNewModelForm(v => !v); setFormMessage(null); }} variant="outline" size="sm">
            <Plus className="h-4 w-4" />
            Entrenar nuevo modelo
          </Button>
        </div>

        {loadingModels ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando modelos...
          </div>
        ) : trainedModels.length === 0 && !activeTrainingJob ? (
          <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
            Todavía no tenés modelos entrenados. Hacé click en <strong>Entrenar nuevo modelo</strong> para empezar.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trainedModels.map(model => (
              <ModelCard
                key={model.id}
                model={model}
                isSelected={selectedModelId === model.id && !signedUrls}
                onSelect={() => {
                  resetGeneration();
                  setSelectedModelId(prev => prev === model.id ? null : model.id);
                }}
              />
            ))}
          </div>
        )}

        {/* Active training progress */}
        {activeTrainingJob ? (
          <div className={cn("mt-4 rounded-md border bg-background p-4", trainedModels.length > 0 && "mt-4")}>
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  Entrenando &quot;{getModelName(activeTrainingJob)}&quot;...
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Estado: {activeTrainingJob.status} · Tiempo: {formatElapsed(trainingElapsed)} · Puede tardar 15–30 min
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setActiveTrainingJob(null); trainingStartRef.current = null; }}
                className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                aria-label="Descartar"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* STAGE 1 — Entrenar nuevo modelo (form) */}
      {showNewModelForm ? (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 text-xl font-semibold">Entrenar nuevo modelo</h2>

          {/* Model name */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium" htmlFor="model-name">
              Nombre del modelo
            </label>
            <input
              id="model-name"
              type="text"
              value={modelName}
              onChange={e => setModelName(e.target.value)}
              placeholder="Ej: Juan, Pedro para LinkedIn, etc."
              maxLength={60}
              disabled={uploading || !!uploadedUrls || trainingCreating}
              className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
          </div>

          {/* Photo uploader */}
          {!uploadedUrls ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Subí entre {MIN_PHOTOS} y {MAX_PHOTOS} fotos tuyas. Distintos ángulos, buena luz, sin anteojos de sol.</p>
                <span className="rounded-md border px-3 py-1 text-sm font-medium">{photos.length} / {MAX_PHOTOS}</span>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                disabled={uploading}
                className="flex min-h-36 w-full flex-col items-center justify-center rounded-lg border border-dashed bg-background px-6 py-6 text-center transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="mb-2 h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-medium">Arrastrá o hacé click para elegir fotos</span>
                <span className="mt-1 text-xs text-muted-foreground">JPG o PNG · Máx 10 MB por foto</span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple className="hidden"
                onChange={e => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = ""; }} />

              {photos.length > 0 ? (
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {photos.map(photo => (
                    <div key={photo.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                      <Image src={photo.previewUrl} alt="" fill unoptimized className="object-cover" />
                      <button type="button" onClick={() => removePhoto(photo.id)}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 shadow-sm hover:bg-background">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex items-center gap-3">
                {photos.length >= MIN_PHOTOS ? (
                  <Button type="button" onClick={uploadPhotos} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {uploading ? formMessage ?? "Subiendo..." : "Confirmar fotos"}
                  </Button>
                ) : null}
                {!uploading ? (
                  <p className={cn("text-sm", formMessage ? "text-destructive" : "text-muted-foreground")}>
                    {formMessage ?? (photos.length === 0 ? "Todavía no seleccionaste fotos." :
                      photos.length < MIN_PHOTOS ? `Agregá ${MIN_PHOTOS - photos.length} foto${MIN_PHOTOS - photos.length === 1 ? "" : "s"} más.` : "Listo para subir.")}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            /* Photos uploaded — ready to train */
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Check className="h-4 w-4" />
                {uploadedUrls.length} fotos subidas correctamente.
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" onClick={startTraining} disabled={trainingCreating || !modelName.trim()}>
                  {trainingCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {trainingCreating ? "Iniciando..." : "Entrenar modelo"}
                </Button>
                {formMessage ? <p className="text-sm text-destructive">{formMessage}</p> : (
                  <p className="text-sm text-muted-foreground">El entrenamiento tarda entre 15 y 30 minutos.</p>
                )}
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* STAGE 2 — Generar con el modelo seleccionado */}
      {selectedModel && !signedUrls ? (
        <section className="rounded-lg border bg-card p-5">
          {generationJobId && generationStatus !== "failed" ? (
            /* Generation in progress */
            <div className="flex max-w-2xl flex-col gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Generando tus headshots...</h2>
                <p className="mt-1 text-sm text-muted-foreground">Modelo: <strong>{getModelName(selectedModel)}</strong></p>
              </div>
              <div className="rounded-md border bg-background p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">Estado: </span>{generationStatus ?? "pending"}</div>
                <div><span className="text-muted-foreground">Tiempo: </span>{formatElapsed(generationElapsed)}</div>
              </div>
              {generationError ? <p className="text-sm text-destructive">{generationError}</p> : null}
            </div>
          ) : generationStatus === "failed" ? (
            /* Generation failed */
            <div className="flex max-w-2xl flex-col gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <X className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">No pudimos generar los headshots.</h2>
                <p className="mt-1 text-sm text-muted-foreground">{generationError ?? "Te devolvimos los créditos si correspondía."}</p>
              </div>
              <Button type="button" onClick={resetGeneration} className="w-fit" variant="outline">
                <RefreshCw className="h-4 w-4" /> Intentar de nuevo
              </Button>
            </div>
          ) : (
            /* Style / count picker */
            <>
              <div className="mb-5">
                <h2 className="text-xl font-semibold">Generar con &quot;{getModelName(selectedModel)}&quot;</h2>
                <p className="mt-1 text-sm text-muted-foreground">Tu modelo ya está entrenado. Elegí el estilo y la cantidad.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {STYLE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setStyle(opt.value)}
                    className={cn("rounded-lg border bg-background p-4 text-left transition-colors hover:bg-muted",
                      style === opt.value && "border-primary ring-2 ring-primary/20")}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-medium">{opt.label}</span>
                      {style === opt.value ? <Check className="h-4 w-4 text-primary" /> : null}
                    </span>
                    <span className="mt-2 block text-sm text-muted-foreground">{opt.description}</span>
                  </button>
                ))}
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-medium">Cantidad</h3>
                <div className="mt-2 inline-flex rounded-md border bg-background p-1">
                  {IMAGE_COUNTS.map(count => (
                    <Button key={count} type="button" size="sm" variant={numImages === count ? "default" : "ghost"} onClick={() => setNumImages(count)}>
                      {count} {count === 1 ? "foto" : "fotos"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <Button type="button" onClick={startGeneration}>
                  Generar mis headshots
                </Button>
                {generationMessage ? (
                  generationMessage.includes("créditos") ? (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <span>{generationMessage}</span>
                      <Button asChild size="sm" variant="outline"><Link href="/pricing">Comprar créditos</Link></Button>
                    </div>
                  ) : <p className="text-sm text-destructive">{generationMessage}</p>
                ) : null}
              </div>
            </>
          )}
        </section>
      ) : null}

      {/* Gallery */}
      {signedUrls?.length ? (
        <HeadshotGallery
          urls={signedUrls}
          modelName={selectedModel ? getModelName(selectedModel) : null}
          selectedImageUrl={selectedImageUrl}
          onSelectImage={setSelectedImageUrl}
          onCloseImage={() => setSelectedImageUrl(null)}
          onReset={resetGeneration}
        />
      ) : null}
    </div>
  );
}

function ModelCard({ model, isSelected, onSelect }: { model: HeadshotJob; isSelected: boolean; onSelect: () => void }) {
  const name = getModelName(model);
  const date = new Date(model.completedAt ?? model.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <button type="button" onClick={onSelect}
      className={cn("rounded-lg border bg-background p-4 text-left transition-colors hover:bg-muted w-full",
        isSelected && "border-primary ring-2 ring-primary/20")}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold leading-tight">{name}</span>
        {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Entrenado el {date}</p>
      <p className={cn("mt-2 text-xs font-medium", isSelected ? "text-primary" : "text-muted-foreground")}>
        {isSelected ? "Seleccionado — elegí el estilo abajo" : "Hacer click para generar"}
      </p>
    </button>
  );
}

function HeadshotGallery({ urls, modelName, selectedImageUrl, onSelectImage, onCloseImage, onReset }: {
  urls: string[];
  modelName: string | null;
  selectedImageUrl: string | null;
  onSelectImage: (url: string) => void;
  onCloseImage: () => void;
  onReset: () => void;
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h2 className="text-xl font-semibold">¡Tus headshots están listos!</h2>
          {modelName ? <p className="mt-1 text-sm text-muted-foreground">Modelo: {modelName}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => { void downloadAll(urls); }}>
            <Download className="h-4 w-4" /> Descargar todas
          </Button>
          <Button type="button" variant="outline" onClick={onReset}>
            <RefreshCw className="h-4 w-4" /> Generar otra sesión
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {urls.map((url, i) => (
          <div key={url} className="overflow-hidden rounded-lg border bg-background">
            <button type="button" onClick={() => onSelectImage(url)} className="relative block aspect-square w-full bg-muted">
              <img src={url} alt={`Headshot ${i + 1}`} className="h-full w-full object-cover transition-opacity hover:opacity-90" />
            </button>
            <div className="flex items-center justify-between gap-2 p-3">
              <span className="text-sm font-medium">Headshot {i + 1}</span>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => onSelectImage(url)} aria-label="Ver en grande">
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { void downloadUrl(url, `headshot-${i + 1}.jpg`); }} aria-label="Descargar">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedImageUrl ? (
        <div role="dialog" aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={onCloseImage}>
          <div className="relative max-h-[90vh] max-w-5xl" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={onCloseImage}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow-sm hover:bg-background"
              aria-label="Cerrar imagen">
              <X className="h-4 w-4" />
            </button>
            <img src={selectedImageUrl} alt="Headshot seleccionado" className="max-h-[90vh] rounded-lg object-contain" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
