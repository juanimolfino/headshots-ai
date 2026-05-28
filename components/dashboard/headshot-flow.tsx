"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_PHOTOS = 5;
const MAX_PHOTOS = 15;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type StyleOption = {
  label: string;
  value: "Photographic" | "Cinematic" | "(No style)";
  description: string;
};

const STYLE_OPTIONS: StyleOption[] = [
  {
    label: "Profesional",
    value: "Photographic",
    description: "Fondo neutro, iluminación de estudio. Ideal para LinkedIn y CV."
  },
  {
    label: "Cinematográfico",
    value: "Cinematic",
    description: "Estilo editorial con mayor contraste. Para perfiles creativos."
  },
  {
    label: "Natural",
    value: "(No style)",
    description: "Sin filtros adicionales. El resultado más cercano a tus fotos originales."
  }
];

const IMAGE_COUNTS = [2, 4, 8] as const;

export function HeadshotFlow() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[] | null>(null);
  const [style, setStyle] = useState<StyleOption["value"]>("Photographic");
  const [numImages, setNumImages] = useState<(typeof IMAGE_COUNTS)[number]>(4);
  const [uploading, setUploading] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    };
  }, []);

  const canContinue = photos.length >= MIN_PHOTOS && !uploading && !uploadedUrls && !jobId;
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

    const formData = new FormData();
    for (const photo of photos) formData.append("files", photo.file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? "No pudimos subir las fotos.");
        return;
      }

      setUploadedUrls(data.urls);
      setMessage(null);
    } catch {
      setMessage("No pudimos subir las fotos. Probá de nuevo.");
    } finally {
      setUploading(false);
    }
  }

  async function createHeadshotJob() {
    if (!uploadedUrls) return;

    setCreatingJob(true);
    setMessage(null);

    try {
      const response = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "headshot",
          input: {
            archive_url: JSON.stringify(uploadedUrls),
            style,
            num_images: numImages
          }
        })
      });
      const data = await response.json();

      if (response.status === 402) {
        setMessage("No tenés créditos suficientes. Comprá un pack para continuar.");
        return;
      }

      if (!response.ok) {
        setMessage(data.error ?? "No pudimos crear el job.");
        return;
      }

      setJobId(data.jobId);
    } catch {
      setMessage("No pudimos crear el job. Probá de nuevo.");
    } finally {
      setCreatingJob(false);
    }
  }

  if (jobId) {
    return (
      <section className="rounded-lg border bg-card p-6">
        <div className="flex max-w-2xl flex-col gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Estamos generando tus headshots.</h1>
            <p className="mt-2 text-muted-foreground">Esto puede tardar entre 5 y 15 minutos.</p>
          </div>
          <div className="rounded-md border bg-background p-3 text-sm">
            <span className="text-muted-foreground">Job ID: </span>
            <code>{jobId}</code>
          </div>
          <p className="text-sm text-muted-foreground">Te avisaremos por email cuando estén listos. Podés cerrar esta pestaña.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
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

      {uploadedUrls ? (
        <section className="rounded-lg border bg-card p-5">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold">Elegí el estilo</h2>
            <p className="mt-1 text-sm text-muted-foreground">{uploadedUrls.length} fotos subidas correctamente.</p>
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
