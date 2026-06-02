"use client";

/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  Images,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  User,
  Wallet,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_PHOTOS = 10;
const MAX_PHOTOS = 15;
const QUICK_MIN_PHOTOS = 4;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 8000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_UPLOAD_DIMENSION = 1024;
const UPLOAD_JPEG_QUALITY = 0.88;

const STYLE_OPTIONS = [
  {
    label: "Professional",
    value: "professional" as const,
    description: "Neutral background, studio lighting. Ideal for LinkedIn and CV."
  },
  {
    label: "Cinematic",
    value: "cinematic" as const,
    description: "Editorial style with higher contrast. For creative profiles."
  },
  {
    label: "Natural",
    value: "natural" as const,
    description: "No extra filters. The result closest to your real photos."
  }
] as const;

const IMAGE_COUNTS = [1, 2, 4] as const;

const BACKGROUND_OPTIONS = [
  { label: "Default", value: null },
  { label: "White", value: "white" as const },
  { label: "Gray", value: "gray" as const },
  { label: "Dark", value: "dark" as const },
  { label: "Outdoor", value: "outdoor" as const }
];

const ATTIRE_OPTIONS = [
  { label: "None", value: null },
  { label: "Suit", value: "suit" as const },
  { label: "Dress", value: "dress" as const },
  { label: "Business casual", value: "business_casual" as const },
  { label: "Casual", value: "casual" as const }
];

const ATTIRE_COLORS = [
  { label: "Black", value: "black", hex: "#18181b" },
  { label: "White", value: "white", hex: "#e4e4e7" },
  { label: "Navy", value: "navy blue", hex: "#1e3a5f" },
  { label: "Gray", value: "gray", hex: "#71717a" },
  { label: "Red", value: "red", hex: "#dc2626" },
  { label: "Green", value: "emerald green", hex: "#059669" },
  { label: "Beige", value: "beige", hex: "#d4b896" }
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

type StyleValue = "professional" | "cinematic" | "natural";
type JobStatus = "pending" | "processing" | "done" | "failed";

type TrainingJob = {
  id: string;
  status: JobStatus;
  input: Record<string, unknown> | null;
  result: { lora_url?: string; trigger_word?: string } | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type GenerateJob = {
  id: string;
  status: JobStatus;
  input: Record<string, unknown> | null;
  result: string[] | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type SelectedPhoto = { id: string; file: File; previewUrl: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function getModelName(job: TrainingJob): string {
  const name = job.input?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return new Date(job.createdAt).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m === 0 ? `${s}s` : `${m}m ${String(s).padStart(2, "0")}s`;
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
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
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
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
            type: "image/jpeg"
          });
          resolve(compressed.size < file.size ? compressed : file);
        },
        "image/jpeg",
        UPLOAD_JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not load ${file.name}`));
    };
    img.src = objectUrl;
  });
}

// ── Main App ─────────────────────────────────────────────────────────────────

export function HeadshotsApp({
  userEmail,
  initialCredits
}: {
  userEmail: string;
  initialCredits: number;
}) {
  // Models
  const [trainedModels, setTrainedModels] = useState<TrainingJob[]>([]);
  const [activeTrainingJob, setActiveTrainingJob] = useState<TrainingJob | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [trainingElapsed, setTrainingElapsed] = useState(0);
  const trainingStartRef = useRef<number | null>(null);

  // Nav
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showNewModelForm, setShowNewModelForm] = useState(false);
  const [showQuickEditForm, setShowQuickEditForm] = useState(false);

  // Rename
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // New model form
  const [modelName, setModelName] = useState("");
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [trainingCreating, setTrainingCreating] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);

  // Quick edit form
  const [quickPhotos, setQuickPhotos] = useState<SelectedPhoto[]>([]);
  const [quickPrompt, setQuickPrompt] = useState(
    "Create a professional headshot using these reference photos. Preserve the person's identity, facial features, and natural expression. Use clean studio lighting, realistic skin texture, a polished outfit, and a neutral background."
  );
  const [quickQuality, setQuickQuality] = useState<"low" | "medium" | "high">("low");
  const [quickNumImages, setQuickNumImages] = useState<(typeof IMAGE_COUNTS)[number]>(1);
  const [quickUploading, setQuickUploading] = useState(false);
  const [quickMessage, setQuickMessage] = useState<string | null>(null);
  const quickFileInputRef = useRef<HTMLInputElement>(null);
  const quickPhotosRef = useRef<SelectedPhoto[]>([]);

  // Generation
  const [style, setStyle] = useState<StyleValue>("professional");
  const [numImages, setNumImages] = useState<(typeof IMAGE_COUNTS)[number]>(4);
  const [background, setBackground] = useState<"white" | "gray" | "dark" | "outdoor" | null>(null);
  const [attireType, setAttireType] = useState<"suit" | "dress" | "business_casual" | "casual" | null>(null);
  const [attireColor, setAttireColor] = useState<string | null>(null);
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<JobStatus | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<string[] | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const generationStartRef = useRef<number | null>(null);

  // History (all generate jobs, filtered per model client-side)
  const [generateJobs, setGenerateJobs] = useState<GenerateJob[]>([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => {
    quickPhotosRef.current = quickPhotos;
  }, [quickPhotos]);
  useEffect(() => {
    return () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl);
      for (const p of quickPhotosRef.current) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?type=headshot-training&limit=20");
      if (!res.ok) return;
      const data = (await res.json()) as { jobs?: TrainingJob[] };
      const all = data.jobs ?? [];
      const done = all.filter(j => {
        if (j.status !== "done") return false;
        const r = j.result;
        return r && r.lora_url && r.trigger_word;
      });
      setTrainedModels(done);
      setSelectedModelId(prev => (prev ? prev : (done[0]?.id ?? null)));
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

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/jobs?type=headshot-generate&limit=50");
    if (!res.ok) return;
    const data = (await res.json()) as { jobs?: GenerateJob[] };
    setGenerateJobs(data.jobs ?? []);
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!activeTrainingJob) return;
    const id = setInterval(loadModels, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeTrainingJob, loadModels]);

  useEffect(() => {
    if (!activeTrainingJob) return;
    const tick = () => {
      if (trainingStartRef.current)
        setTrainingElapsed(Math.floor((Date.now() - trainingStartRef.current) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTrainingJob]);

  useEffect(() => {
    if (!generationJobId || signedUrls || generationStatus === "failed") return;
    const poll = async () => {
      const res = await fetch(`/api/jobs/${generationJobId}`);
      const data = (await res.json()) as { status: JobStatus; error: string | null };
      setGenerationStatus(data.status);
      setGenerationError(data.error);
      if (data.status === "done") {
        const sRes = await fetch(`/api/jobs/${generationJobId}/signed-urls`, { method: "POST" });
        const sData = (await sRes.json()) as { signedUrls?: string[] };
        setSignedUrls(sData.signedUrls ?? []);
        void loadHistory();
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [generationJobId, generationStatus, signedUrls, loadHistory]);

  useEffect(() => {
    if (!generationJobId || signedUrls || generationStatus === "failed") return;
    const tick = () => {
      if (generationStartRef.current)
        setGenerationElapsed(Math.floor((Date.now() - generationStartRef.current) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [generationJobId, generationStatus, signedUrls]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleSelectModel(modelId: string) {
    setSelectedModelId(modelId);
    setShowNewModelForm(false);
    setShowQuickEditForm(false);
    resetGeneration();
  }

  function handleNewModel() {
    setSelectedModelId(null);
    setShowNewModelForm(true);
    setShowQuickEditForm(false);
    resetGeneration();
  }

  function handleQuickEdit() {
    setSelectedModelId(null);
    setShowNewModelForm(false);
    setShowQuickEditForm(true);
    resetGeneration();
  }

  function resetGeneration() {
    setGenerationJobId(null);
    setGenerationStatus(null);
    setGenerationError(null);
    setGenerationMessage(null);
    setSignedUrls(null);
    setSelectedImageUrl(null);
    setGenerationElapsed(0);
    generationStartRef.current = null;
    setBackground(null);
    setAttireType(null);
    setAttireColor(null);
  }

  async function renameModel(modelId: string, newName: string) {
    const trimmed = newName.trim().slice(0, 60);
    if (!trimmed) return;
    const res = await fetch(`/api/jobs/${modelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed })
    });
    if (!res.ok) return;
    setTrainedModels(prev =>
      prev.map(m => (m.id === modelId ? { ...m, input: { ...m.input, name: trimmed } } : m))
    );
  }

  function addFiles(fileList: FileList | File[]) {
    setFormMessage(null);
    const errors: string[] = [];
    const accepted: SelectedPhoto[] = [];
    for (const file of Array.from(fileList)) {
      if (!ALLOWED_TYPES.has(file.type)) continue;
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name} exceeds 10 MB.`);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file)
      });
    }
    const slots = MAX_PHOTOS - photos.length;
    const toAdd = accepted.slice(0, Math.max(slots, 0));
    for (const p of accepted.slice(toAdd.length)) URL.revokeObjectURL(p.previewUrl);
    const skipped = accepted.length - toAdd.length;
    setPhotos(prev => [...prev, ...toAdd]);
    if (skipped > 0) setFormMessage(`You can upload up to ${MAX_PHOTOS} photos.`);
    else if (errors[0]) setFormMessage(errors[0]);
  }

  function addQuickFiles(fileList: FileList | File[]) {
    setQuickMessage(null);
    const errors: string[] = [];
    const accepted: SelectedPhoto[] = [];
    for (const file of Array.from(fileList)) {
      if (!ALLOWED_TYPES.has(file.type)) continue;
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name} exceeds 10 MB.`);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file)
      });
    }
    const slots = MAX_PHOTOS - quickPhotos.length;
    const toAdd = accepted.slice(0, Math.max(slots, 0));
    for (const p of accepted.slice(toAdd.length)) URL.revokeObjectURL(p.previewUrl);
    const skipped = accepted.length - toAdd.length;
    setQuickPhotos(prev => [...prev, ...toAdd]);
    if (skipped > 0) setQuickMessage(`You can upload up to ${MAX_PHOTOS} photos.`);
    else if (errors[0]) setQuickMessage(errors[0]);
  }

  function removePhoto(id: string) {
    setPhotos(prev => {
      const p = prev.find(x => x.id === id);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  }

  function removeQuickPhoto(id: string) {
    setQuickPhotos(prev => {
      const p = prev.find(x => x.id === id);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  }

  async function uploadPhotos() {
    if (photos.length < MIN_PHOTOS) {
      setFormMessage(`Upload at least ${MIN_PHOTOS} photos.`);
      return;
    }
    setUploading(true);
    setFormMessage(null);
    try {
      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        setFormMessage(`Uploading photo ${i + 1} of ${photos.length}...`);
        const file = await compressImage(photos[i].file);
        const initRes = await fetch("/api/upload/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size })
        });
        const initData = (await readJsonOrText(initRes)) as {
          uploadUrl?: string;
          fileUrl?: string;
          error?: string;
        } | null;
        if (!initRes.ok || !initData?.uploadUrl || !initData.fileUrl) {
          throw new Error(
            initData?.error ?? `Could not prepare upload for ${photos[i].file.name}.`
          );
        }
        const upRes = await fetch(initData.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file
        });
        if (!upRes.ok) throw new Error(`Could not upload ${photos[i].file.name}.`);
        urls.push(initData.fileUrl);
      }
      setUploadedUrls(urls);
      setFormMessage(null);
    } catch (err) {
      setFormMessage(
        err instanceof Error ? err.message : "Could not upload photos. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  async function startTraining() {
    if (!uploadedUrls) return;
    if (!modelName.trim()) {
      setFormMessage("Please give your model a name.");
      return;
    }
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
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (res.status === 402) throw new Error("Not enough credits.");
      if (!res.ok) throw new Error(data.error ?? "Could not start training.");
      for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl);
      setPhotos([]);
      setUploadedUrls(null);
      setModelName("");
      setShowNewModelForm(false);
      trainingStartRef.current = Date.now();
      await loadModels();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Could not start training.");
    } finally {
      setTrainingCreating(false);
    }
  }

  async function startGeneration() {
    const model = trainedModels.find(m => m.id === selectedModelId);
    if (!model) return;
    const r = model.result;
    if (!r?.lora_url || !r?.trigger_word) return;
    setGenerationMessage(null);
    const res = await fetch("/api/jobs/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "headshot-generate",
        input: {
          lora_url: r.lora_url,
          trigger_word: r.trigger_word,
          style,
          num_images: numImages,
          ...(background ? { background } : {}),
          ...(attireType ? { attire: attireType } : {}),
          ...(attireType && attireColor ? { attire_color: attireColor } : {})
        }
      })
    });
    const data = (await res.json()) as { jobId?: string; error?: string };
    if (res.status === 402) {
      setGenerationMessage("Not enough credits.");
      return;
    }
    if (!res.ok) {
      setGenerationMessage(data.error ?? "Could not start generation.");
      return;
    }
    generationStartRef.current = Date.now();
    setGenerationJobId(data.jobId!);
    setGenerationStatus("pending");
    setGenerationError(null);
    setSignedUrls(null);
    setGenerationElapsed(0);
  }

  async function startQuickEdit() {
    if (quickPhotos.length < QUICK_MIN_PHOTOS) {
      setQuickMessage(`Upload at least ${QUICK_MIN_PHOTOS} photos.`);
      return;
    }
    if (quickPrompt.trim().length < 10) {
      setQuickMessage("Write a prompt with at least 10 characters.");
      return;
    }

    setQuickUploading(true);
    setQuickMessage(null);
    try {
      const urls: string[] = [];
      for (let i = 0; i < quickPhotos.length; i++) {
        setQuickMessage(`Uploading photo ${i + 1} of ${quickPhotos.length}...`);
        const file = await compressImage(quickPhotos[i].file);
        const initRes = await fetch("/api/upload/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size })
        });
        const initData = (await readJsonOrText(initRes)) as {
          uploadUrl?: string;
          fileUrl?: string;
          error?: string;
        } | null;
        if (!initRes.ok || !initData?.uploadUrl || !initData.fileUrl) {
          throw new Error(initData?.error ?? `Could not prepare upload for ${quickPhotos[i].file.name}.`);
        }
        const upRes = await fetch(initData.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file
        });
        if (!upRes.ok) throw new Error(`Could not upload ${quickPhotos[i].file.name}.`);
        urls.push(initData.fileUrl);
      }

      setQuickMessage("Starting generation...");
      const res = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "headshot-edit",
          input: {
            image_urls: urls,
            prompt: quickPrompt.trim(),
            quality: quickQuality,
            num_images: quickNumImages
          }
        })
      });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (res.status === 402) throw new Error("Not enough credits.");
      if (!res.ok) throw new Error(data.error ?? "Could not start generation.");

      generationStartRef.current = Date.now();
      setGenerationJobId(data.jobId!);
      setGenerationStatus("pending");
      setGenerationError(null);
      setSignedUrls(null);
      setGenerationElapsed(0);
      setQuickMessage(null);
    } catch (err) {
      setQuickMessage(err instanceof Error ? err.message : "Could not generate photos.");
    } finally {
      setQuickUploading(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedModel = trainedModels.find(m => m.id === selectedModelId) ?? null;

  const modelGenerateJobs = selectedModel
    ? generateJobs.filter(j => {
        if (j.id === generationJobId) return false;
        const loraUrl = (j.input as { lora_url?: string } | null)?.lora_url;
        const modelLora = selectedModel.result?.lora_url;
        return loraUrl && modelLora && loraUrl === modelLora;
      })
    : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 border-b border-zinc-800 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white">
            <Sparkles className="h-3.5 w-3.5 text-zinc-900" />
          </div>
          <span className="text-sm font-semibold text-white">Headshots AI</span>
        </div>

        {/* Models nav */}
        <div className="flex-1 overflow-y-auto py-4">
          <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            Your models
          </p>

          {loadingModels ? (
            <div className="flex items-center gap-2 px-4 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
              <span className="text-xs text-zinc-400">Loading...</span>
            </div>
          ) : (
            <>
              {trainedModels.map(model => {
                const name = getModelName(model);
                const isSelected = selectedModelId === model.id && !showNewModelForm;
                const isEditing = editingModelId === model.id;
                return (
                  <div
                    key={model.id}
                    onClick={() => !isEditing && handleSelectModel(model.id)}
                    className={cn(
                      "group/model flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-300 hover:bg-zinc-800/50 hover:text-white"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase",
                        isSelected ? "bg-white text-zinc-900" : "bg-zinc-800 text-zinc-300"
                      )}
                    >
                      {name.charAt(0)}
                    </div>
                    {isEditing ? (
                      <input
                        autoFocus
                        className="flex-1 truncate bg-transparent text-sm outline-none"
                        value={editingName}
                        maxLength={60}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            void renameModel(model.id, editingName);
                            setEditingModelId(null);
                          }
                          if (e.key === "Escape") setEditingModelId(null);
                        }}
                        onBlur={() => {
                          void renameModel(model.id, editingName);
                          setEditingModelId(null);
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <span className="flex-1 truncate text-sm">{name}</span>
                        <button
                          type="button"
                          className="shrink-0 opacity-0 transition-opacity group-hover/model:opacity-100"
                          title="Rename"
                          onClick={e => {
                            e.stopPropagation();
                            setEditingModelId(model.id);
                            setEditingName(name);
                          }}
                        >
                          <Pencil className="h-3 w-3 text-zinc-500 hover:text-zinc-300" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}

              {activeTrainingJob && (
                <div className="mx-3 mt-1 flex items-center gap-2 rounded-md bg-zinc-900 px-2.5 py-2">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-zinc-200">
                      {getModelName(activeTrainingJob)}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Training · {formatElapsed(trainingElapsed)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTrainingJob(null);
                      trainingStartRef.current = null;
                    }}
                    className="text-zinc-500 hover:text-zinc-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {trainedModels.length === 0 && !activeTrainingJob && (
                <p className="px-4 py-1 text-xs text-zinc-500">No trained models yet.</p>
              )}

              <div className="mt-3 px-3">
                <button
                  type="button"
                  onClick={handleQuickEdit}
                  className={cn(
                    "mb-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors",
                    showQuickEditForm
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                  )}
                >
                  <Images className="h-3.5 w-3.5" />
                  Quick GPT edit
                </button>
                <button
                  type="button"
                  onClick={handleNewModel}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New model
                </button>
              </div>
            </>
          )}
        </div>

        {/* Bottom */}
        <div className="border-t border-zinc-800 px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-zinc-400">Credits</span>
            <span className="text-xs font-semibold text-zinc-200">{initialCredits}</span>
          </div>
          <Link
            href="/pricing"
            className="mb-4 flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <Wallet className="h-3.5 w-3.5" />
            Buy credits
          </Link>
          <div className="flex items-center gap-2 border-t border-zinc-800 pt-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800">
              <User className="h-3.5 w-3.5 text-zinc-400" />
            </div>
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{userEmail}</span>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="text-zinc-500 transition-colors hover:text-zinc-300"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col overflow-hidden bg-zinc-50">
        {showNewModelForm ? (
          <NewModelPanel
            modelName={modelName}
            photos={photos}
            uploadedUrls={uploadedUrls}
            uploading={uploading}
            trainingCreating={trainingCreating}
            formMessage={formMessage}
            fileInputRef={fileInputRef}
            onModelNameChange={setModelName}
            onAddFiles={addFiles}
            onRemovePhoto={removePhoto}
            onUpload={() => void uploadPhotos()}
            onStartTraining={() => void startTraining()}
            onCancel={() => {
              setShowNewModelForm(false);
              if (trainedModels[0]) setSelectedModelId(trainedModels[0].id);
            }}
          />
        ) : showQuickEditForm ? (
          <QuickEditPanel
            photos={quickPhotos}
            prompt={quickPrompt}
            quality={quickQuality}
            numImages={quickNumImages}
            uploading={quickUploading}
            message={quickMessage}
            generationJobId={generationJobId}
            generationStatus={generationStatus}
            generationError={generationError}
            generationElapsed={generationElapsed}
            signedUrls={signedUrls}
            selectedImageUrl={selectedImageUrl}
            fileInputRef={quickFileInputRef}
            onPromptChange={setQuickPrompt}
            onQualityChange={setQuickQuality}
            onNumImagesChange={setQuickNumImages}
            onAddFiles={addQuickFiles}
            onRemovePhoto={removeQuickPhoto}
            onGenerate={() => void startQuickEdit()}
            onReset={resetGeneration}
            onSelectImage={setSelectedImageUrl}
            onCloseImage={() => setSelectedImageUrl(null)}
            onCancel={() => {
              setShowQuickEditForm(false);
              if (trainedModels[0]) setSelectedModelId(trainedModels[0].id);
            }}
          />
        ) : selectedModel ? (
          <ModelWorkspace
            model={selectedModel}
            style={style}
            numImages={numImages}
            background={background}
            attireType={attireType}
            attireColor={attireColor}
            generationJobId={generationJobId}
            generationStatus={generationStatus}
            generationError={generationError}
            generationMessage={generationMessage}
            generationElapsed={generationElapsed}
            signedUrls={signedUrls}
            selectedImageUrl={selectedImageUrl}
            modelGenerateJobs={modelGenerateJobs}
            onStyleChange={setStyle}
            onNumImagesChange={setNumImages}
            onBackgroundChange={setBackground}
            onAttireTypeChange={v => { setAttireType(v); setAttireColor(null); }}
            onAttireColorChange={setAttireColor}
            onGenerate={() => void startGeneration()}
            onReset={resetGeneration}
            onSelectImage={setSelectedImageUrl}
            onCloseImage={() => setSelectedImageUrl(null)}
          />
        ) : !loadingModels ? (
          <EmptyState onNewModel={handleNewModel} />
        ) : null}
      </div>
    </div>
  );
}

// ── New model form ────────────────────────────────────────────────────────────

function NewModelPanel({
  modelName,
  photos,
  uploadedUrls,
  uploading,
  trainingCreating,
  formMessage,
  fileInputRef,
  onModelNameChange,
  onAddFiles,
  onRemovePhoto,
  onUpload,
  onStartTraining,
  onCancel
}: {
  modelName: string;
  photos: SelectedPhoto[];
  uploadedUrls: string[] | null;
  uploading: boolean;
  trainingCreating: boolean;
  formMessage: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onModelNameChange: (v: string) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onRemovePhoto: (id: string) => void;
  onUpload: () => void;
  onStartTraining: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="mb-8 flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Cancel
        </button>
        <span className="text-zinc-300">/</span>
        <h1 className="text-sm font-semibold text-zinc-900">New model</h1>
      </div>

      <div className="max-w-lg space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">Model name</label>
          <input
            type="text"
            value={modelName}
            onChange={e => onModelNameChange(e.target.value)}
            placeholder="e.g. Alex, Jordan…"
            maxLength={60}
            disabled={uploading || !!uploadedUrls || trainingCreating}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-100 disabled:opacity-60"
          />
        </div>

        {!uploadedUrls ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-700">
                Photos ({MIN_PHOTOS}–{MAX_PHOTOS})
              </label>
              <span className="text-sm text-zinc-400">
                {photos.length} / {MAX_PHOTOS}
              </span>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                onAddFiles(e.dataTransfer.files);
              }}
              disabled={uploading}
              className="flex min-h-32 w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-6 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="mb-2 h-6 w-6 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-700">Drag or click to select</span>
              <span className="mt-1 text-xs text-zinc-400">JPG or PNG · Max 10 MB per photo</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files) onAddFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />

            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-5 gap-2">
                {photos.map(photo => (
                  <div
                    key={photo.id}
                    className="relative aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-100"
                  >
                    <Image
                      src={photo.previewUrl}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => onRemovePhoto(photo.id)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-white"
                    >
                      <X className="h-3 w-3 text-zinc-700" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {formMessage && (
              <p className={cn("mt-3 text-sm", uploading ? "text-zinc-500" : "text-red-600")}>
                {formMessage}
              </p>
            )}

            <div className="mt-5">
              {photos.length >= MIN_PHOTOS ? (
                <Button
                  type="button"
                  onClick={onUpload}
                  disabled={uploading}
                  className="bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {uploading ? (formMessage ?? "Uploading...") : "Confirm photos"}
                </Button>
              ) : (
                <p className="text-sm text-zinc-400">
                  {photos.length === 0
                    ? "Select 10–15 photos of yourself with different angles and good lighting."
                    : `Add ${MIN_PHOTOS - photos.length} more photo${MIN_PHOTOS - photos.length === 1 ? "" : "s"}.`}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <Check className="h-4 w-4" />
              {uploadedUrls.length} photos ready for training.
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={onStartTraining}
                disabled={trainingCreating || !modelName.trim()}
                className="bg-zinc-900 text-white hover:bg-zinc-800"
              >
                {trainingCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                {trainingCreating ? "Starting..." : "Train model"}
              </Button>
              {formMessage ? (
                <p className="text-sm text-red-600">{formMessage}</p>
              ) : (
                <p className="text-sm text-zinc-400">Takes 15–30 minutes.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quick GPT edit form ───────────────────────────────────────────────────────

function QuickEditPanel({
  photos,
  prompt,
  quality,
  numImages,
  uploading,
  message,
  generationJobId,
  generationStatus,
  generationError,
  generationElapsed,
  signedUrls,
  selectedImageUrl,
  fileInputRef,
  onPromptChange,
  onQualityChange,
  onNumImagesChange,
  onAddFiles,
  onRemovePhoto,
  onGenerate,
  onReset,
  onSelectImage,
  onCloseImage,
  onCancel
}: {
  photos: SelectedPhoto[];
  prompt: string;
  quality: "low" | "medium" | "high";
  numImages: (typeof IMAGE_COUNTS)[number];
  uploading: boolean;
  message: string | null;
  generationJobId: string | null;
  generationStatus: JobStatus | null;
  generationError: string | null;
  generationElapsed: number;
  signedUrls: string[] | null;
  selectedImageUrl: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPromptChange: (v: string) => void;
  onQualityChange: (v: "low" | "medium" | "high") => void;
  onNumImagesChange: (v: (typeof IMAGE_COUNTS)[number]) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onRemovePhoto: (id: string) => void;
  onGenerate: () => void;
  onReset: () => void;
  onSelectImage: (url: string) => void;
  onCloseImage: () => void;
  onCancel: () => void;
}) {
  const isGenerating = !!generationJobId && !signedUrls && generationStatus !== "failed";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-zinc-300">/</span>
          <h1 className="font-semibold text-zinc-900">Quick GPT edit</h1>
        </div>
        {signedUrls?.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            className="border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Generate again
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        {isGenerating ? (
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              </div>
              <div>
                <p className="font-medium text-zinc-900">Generating with GPT Image 2...</p>
                <p className="mt-0.5 text-sm text-zinc-400">
                  {formatElapsed(generationElapsed)} · Usually finishes in about a minute
                </p>
              </div>
            </div>
            {generationError && <p className="mt-3 text-sm text-red-600">{generationError}</p>}
          </div>
        ) : generationStatus === "failed" ? (
          <div className="mb-8 rounded-xl border border-red-100 bg-red-50 p-6">
            <p className="font-medium text-red-800">Could not generate photos.</p>
            <p className="mt-1 text-sm text-red-500">
              {generationError ?? "Credits were refunded if applicable."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReset}
              className="mt-4 border-red-200 text-red-700 hover:bg-red-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        ) : signedUrls?.length ? (
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Results</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void downloadAll(signedUrls)}
                className="border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download all
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {signedUrls.map((url, i) => (
                <div key={url} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  <button
                    type="button"
                    onClick={() => onSelectImage(url)}
                    className="relative block aspect-square w-full bg-zinc-100"
                  >
                    <img
                      src={url}
                      alt={`Edited headshot ${i + 1}`}
                      className="h-full w-full object-cover transition-opacity hover:opacity-90"
                    />
                  </button>
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-xs font-medium text-zinc-500">#{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => void downloadUrl(url, `gpt-headshot-${i + 1}.jpg`)}
                      className="text-zinc-400 transition-colors hover:text-zinc-700"
                      aria-label="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl rounded-xl border border-zinc-200 bg-white p-6">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              GPT Image 2 edit
            </p>

            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-700">
                  Reference photos ({QUICK_MIN_PHOTOS}-{MAX_PHOTOS})
                </label>
                <span className="text-sm text-zinc-400">{photos.length} / {MAX_PHOTOS}</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  onAddFiles(e.dataTransfer.files);
                }}
                disabled={uploading}
                className="flex min-h-28 w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 py-6 text-center transition-colors hover:border-zinc-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="mb-2 h-6 w-6 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-700">Drag or click to select</span>
                <span className="mt-1 text-xs text-zinc-400">JPG or PNG · More photos improve consistency</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                multiple
                className="hidden"
                onChange={e => {
                  if (e.target.files) onAddFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              {photos.length > 0 && (
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {photos.map(photo => (
                    <div key={photo.id} className="relative aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
                      <Image src={photo.previewUrl} alt="" fill unoptimized className="object-cover" />
                      <button
                        type="button"
                        onClick={() => onRemovePhoto(photo.id)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-white"
                      >
                        <X className="h-3 w-3 text-zinc-700" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-zinc-700">Prompt</label>
              <textarea
                value={prompt}
                onChange={e => onPromptChange(e.target.value)}
                rows={5}
                maxLength={2000}
                className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-100"
              />
            </div>

            <div className="mb-6 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2.5 text-sm font-medium text-zinc-700">Quality</p>
                <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                  {(["low", "medium", "high"] as const).map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onQualityChange(q)}
                      className={cn(
                        "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all",
                        quality === q ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2.5 text-sm font-medium text-zinc-700">Count</p>
                <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                  {IMAGE_COUNTS.map(count => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onNumImagesChange(count)}
                      className={cn(
                        "rounded-md px-4 py-1.5 text-sm font-medium transition-all",
                        numImages === count ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={onGenerate}
                disabled={uploading || photos.length < QUICK_MIN_PHOTOS}
                className="bg-zinc-900 text-white hover:bg-zinc-800"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {uploading ? (message ?? "Uploading...") : "Generate with GPT Image 2"}
              </Button>
              {message &&
                (message.toLowerCase().includes("credit") ? (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <span>{message}</span>
                    <Button asChild size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
                      <Link href="/pricing">Buy credits</Link>
                    </Button>
                  </div>
                ) : (
                  <p className={cn("text-sm", uploading ? "text-zinc-500" : "text-red-600")}>{message}</p>
                ))}
            </div>
          </div>
        )}
      </div>

      {selectedImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={onCloseImage}
        >
          <div className="relative max-h-[90vh] max-w-5xl" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={onCloseImage}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            <img src={selectedImageUrl} alt="Edited headshot" className="max-h-[90vh] rounded-xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Model workspace ───────────────────────────────────────────────────────────

function ModelWorkspace({
  model,
  style,
  numImages,
  background,
  attireType,
  attireColor,
  generationJobId,
  generationStatus,
  generationError,
  generationMessage,
  generationElapsed,
  signedUrls,
  selectedImageUrl,
  modelGenerateJobs,
  onStyleChange,
  onNumImagesChange,
  onBackgroundChange,
  onAttireTypeChange,
  onAttireColorChange,
  onGenerate,
  onReset,
  onSelectImage,
  onCloseImage
}: {
  model: TrainingJob;
  style: StyleValue;
  numImages: (typeof IMAGE_COUNTS)[number];
  background: "white" | "gray" | "dark" | "outdoor" | null;
  attireType: "suit" | "dress" | "business_casual" | "casual" | null;
  attireColor: string | null;
  generationJobId: string | null;
  generationStatus: JobStatus | null;
  generationError: string | null;
  generationMessage: string | null;
  generationElapsed: number;
  signedUrls: string[] | null;
  selectedImageUrl: string | null;
  modelGenerateJobs: GenerateJob[];
  onStyleChange: (v: StyleValue) => void;
  onNumImagesChange: (v: (typeof IMAGE_COUNTS)[number]) => void;
  onBackgroundChange: (v: "white" | "gray" | "dark" | "outdoor" | null) => void;
  onAttireTypeChange: (v: "suit" | "dress" | "business_casual" | "casual" | null) => void;
  onAttireColorChange: (v: string | null) => void;
  onGenerate: () => void;
  onReset: () => void;
  onSelectImage: (url: string) => void;
  onCloseImage: () => void;
}) {
  const modelName = getModelName(model);
  const isGenerating =
    !!generationJobId && !signedUrls && generationStatus !== "failed";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-8">
        <h1 className="font-semibold text-zinc-900">{modelName}</h1>
        {signedUrls?.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            className="border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Generate again
          </Button>
        ) : null}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {isGenerating ? (
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              </div>
              <div>
                <p className="font-medium text-zinc-900">Generating headshots…</p>
                <p className="mt-0.5 text-sm text-zinc-400">
                  {formatElapsed(generationElapsed)} · May take up to 1 minute
                </p>
              </div>
            </div>
            {generationError && (
              <p className="mt-3 text-sm text-red-600">{generationError}</p>
            )}
          </div>
        ) : generationStatus === "failed" ? (
          <div className="mb-8 rounded-xl border border-red-100 bg-red-50 p-6">
            <p className="font-medium text-red-800">Could not generate headshots.</p>
            <p className="mt-1 text-sm text-red-500">
              {generationError ?? "Credits were refunded if applicable."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReset}
              className="mt-4 border-red-200 text-red-700 hover:bg-red-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        ) : signedUrls?.length ? (
          /* Current session results */
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Results
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void downloadAll(signedUrls)}
                className="border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download all
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {signedUrls.map((url, i) => (
                <div
                  key={url}
                  className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => onSelectImage(url)}
                    className="relative block aspect-square w-full bg-zinc-100"
                  >
                    <img
                      src={url}
                      alt={`Headshot ${i + 1}`}
                      className="h-full w-full object-cover transition-opacity hover:opacity-90"
                    />
                  </button>
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-xs font-medium text-zinc-500">#{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => void downloadUrl(url, `headshot-${i + 1}.jpg`)}
                      className="text-zinc-400 transition-colors hover:text-zinc-700"
                      aria-label="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Generation form */
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              New generation
            </p>

            {/* Style */}
            <div className="mb-5">
              <p className="mb-2.5 text-sm font-medium text-zinc-700">Style</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {STYLE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onStyleChange(opt.value)}
                    className={cn(
                      "rounded-lg border p-3.5 text-left transition-all",
                      style === opt.value
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white"
                    )}
                  >
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span
                      className={cn(
                        "mt-1 block text-xs leading-relaxed",
                        style === opt.value ? "text-zinc-300" : "text-zinc-400"
                      )}
                    >
                      {opt.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Background */}
            <div className="mb-5">
              <p className="mb-2.5 text-sm font-medium text-zinc-700">
                Background{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {BACKGROUND_OPTIONS.map(opt => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => onBackgroundChange(opt.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                      background === opt.value
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Attire */}
            <div className="mb-5">
              <p className="mb-2.5 text-sm font-medium text-zinc-700">
                Attire{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {ATTIRE_OPTIONS.map(opt => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => onAttireTypeChange(opt.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                      attireType === opt.value
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Color swatches — only when an attire type is selected */}
              {attireType && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-zinc-500">Color</p>
                  <div className="flex flex-wrap gap-2">
                    {ATTIRE_COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.label}
                        onClick={() => onAttireColorChange(attireColor === c.value ? null : c.value)}
                        className={cn(
                          "h-6 w-6 rounded-full border-2 transition-all",
                          attireColor === c.value
                            ? "border-zinc-900 scale-110"
                            : "border-transparent hover:border-zinc-400"
                        )}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Count */}
            <div className="mb-6">
              <p className="mb-2.5 text-sm font-medium text-zinc-700">Count</p>
              <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                {IMAGE_COUNTS.map(count => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onNumImagesChange(count)}
                    className={cn(
                      "rounded-md px-4 py-1.5 text-sm font-medium transition-all",
                      numImages === count
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-zinc-400 hover:text-zinc-600"
                    )}
                  >
                    {count} {count === 1 ? "photo" : "photos"}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={onGenerate}
                className="bg-zinc-900 text-white hover:bg-zinc-800"
              >
                <Sparkles className="h-4 w-4" />
                Generate headshots
              </Button>
              {generationMessage &&
                (generationMessage.toLowerCase().includes("credit") ? (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <span>{generationMessage}</span>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <Link href="/pricing">Buy credits</Link>
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-red-600">{generationMessage}</p>
                ))}
            </div>
          </div>
        )}

        {/* Past generates for this model */}
        {modelGenerateJobs.length > 0 && (
          <ModelHistory jobs={modelGenerateJobs} />
        )}
      </div>

      {/* Full-screen image modal */}
      {selectedImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={onCloseImage}
        >
          <div
            className="relative max-h-[90vh] max-w-5xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onCloseImage}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            <img
              src={selectedImageUrl}
              alt="Headshot"
              className="max-h-[90vh] rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Model history (per-model past generates) ──────────────────────────────────

const HISTORY_PAGE_SIZE = 10;

function ModelHistory({ jobs }: { jobs: GenerateJob[] }) {
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const doneJobs = jobs.filter(j => j.status === "done");
  if (doneJobs.length === 0) return null;

  const visibleJobs = doneJobs.slice(0, visibleCount);
  const remaining = doneJobs.length - visibleCount;

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
        History
      </p>
      <div className="space-y-2">
        {visibleJobs.map(job => (
          <HistoryRow key={job.id} job={job} onOpenImage={setSelectedImage} />
        ))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleCount(v => v + HISTORY_PAGE_SIZE)}
          className="mt-3 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
        >
          Load {Math.min(HISTORY_PAGE_SIZE, remaining)} more ({remaining} remaining)
        </button>
      )}

      {selectedImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-5xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            <img
              src={selectedImage}
              alt="Headshot"
              className="max-h-[90vh] rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryRow({
  job,
  onOpenImage
}: {
  job: GenerateJob;
  onOpenImage: (url: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [signedUrls, setSignedUrls] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}/signed-urls`, { method: "POST" });
        const data = (await res.json()) as { signedUrls?: string[] };
        if (!cancelled) setSignedUrls(data.signedUrls ?? []);
      } catch {
        if (!cancelled) setSignedUrls([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.id]);

  const thumbnails = signedUrls?.slice(0, 4) ?? [];
  const jobStyle = (job.input as { style?: string } | null)?.style ?? "professional";
  const styleLabel = STYLE_OPTIONS.find(s => s.value === jobStyle)?.label ?? jobStyle;
  const count = (job.input as { num_images?: number } | null)?.num_images ?? thumbnails.length;
  const date = new Date(job.completedAt ?? job.createdAt).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setIsExpanded(v => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
      >
        {/* Thumbnails or skeleton placeholders */}
        <div className="flex shrink-0 gap-0.5">
          {signedUrls === null
            ? Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                <div key={i} className="h-10 w-10 animate-pulse rounded-md bg-zinc-100" />
              ))
            : thumbnails.map((url, i) => (
                <div key={i} className="h-10 w-10 overflow-hidden rounded-md bg-zinc-100">
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </div>
              ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-800">
            {styleLabel} · {count} {count === 1 ? "photo" : "photos"}
          </p>
          <p className="text-xs text-zinc-400">{date}</p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-zinc-400 transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-zinc-100 p-4">
          {signedUrls === null ? (
            <div className="flex items-center gap-2 py-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : signedUrls.length > 0 ? (
            <>
              <div className="mb-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void downloadAll(signedUrls)}
                  className="border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download all
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {signedUrls.map((url, i) => (
                  <div
                    key={url}
                    className="overflow-hidden rounded-lg border border-zinc-100"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenImage(url)}
                      className="block aspect-square w-full bg-zinc-100"
                    >
                      <img
                        src={url}
                        alt={`Headshot ${i + 1}`}
                        className="h-full w-full object-cover transition-opacity hover:opacity-90"
                      />
                    </button>
                    <div className="flex items-center justify-between p-2">
                      <span className="text-xs text-zinc-400">#{i + 1}</span>
                      <button
                        type="button"
                        onClick={() => void downloadUrl(url, `headshot-${i + 1}.jpg`)}
                        className="text-zinc-400 transition-colors hover:text-zinc-700"
                        aria-label="Download"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-1 text-sm text-zinc-400">Could not load photos.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onNewModel }: { onNewModel: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-20 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h2 className="text-xl font-semibold text-zinc-900">Get started with your first model</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-500">
        Upload 10–15 photos of yourself to train a personalized model. Each model can be used to
        generate unlimited headshots.
      </p>
      <Button
        type="button"
        onClick={onNewModel}
        className="mt-6 bg-zinc-900 text-white hover:bg-zinc-800"
      >
        <Plus className="h-4 w-4" />
        Train your first model
      </Button>
    </div>
  );
}
