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
  Trash2,
  Upload,
  User,
  Wallet,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DashboardWorkspace,
  type ActiveGenerationJob,
  type DashboardMode
} from "@/components/dashboard/dashboard-ui";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_PHOTOS = 10;
const MAX_PHOTOS = 15;
const QUICK_MIN_PHOTOS = 4;
const TRAINING_CREDITS = 15;
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

  // Quick GPT edit history (all headshot-edit jobs)
  const [editJobs, setEditJobs] = useState<GenerateJob[]>([]);

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

  const loadEditHistory = useCallback(async () => {
    const res = await fetch("/api/jobs?type=headshot-edit&limit=50");
    if (!res.ok) return;
    const data = (await res.json()) as { jobs?: GenerateJob[] };
    setEditJobs(data.jobs ?? []);
  }, []);

  const deleteEditJob = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    if (!res.ok) return;
    setEditJobs(prev => prev.filter(j => j.id !== jobId));
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void loadModels(), 0);
    return () => window.clearTimeout(id);
  }, [loadModels]);
  useEffect(() => {
    const id = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(id);
  }, [loadHistory]);
  useEffect(() => {
    const id = window.setTimeout(() => void loadEditHistory(), 0);
    return () => window.clearTimeout(id);
  }, [loadEditHistory]);

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
        void loadEditHistory();
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [generationJobId, generationStatus, signedUrls, loadHistory, loadEditHistory]);

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

  const activeGenerationJob: ActiveGenerationJob | null =
    generationJobId && !signedUrls && generationStatus !== "failed"
      ? {
          id: generationJobId,
          status: generationStatus,
          progress: Math.min(95, Math.max(12, Math.round((generationElapsed / 60) * 70))),
          style,
          count: numImages,
          background,
          elapsed: generationElapsed,
          createdAt: generationStartRef.current ? new Date(generationStartRef.current).toISOString() : new Date().toISOString()
        }
      : null;

  const mode: DashboardMode = showNewModelForm
    ? "new-model"
    : showQuickEditForm
      ? "quick-edit"
      : loadingModels
        ? "loading"
        : selectedModel
          ? "model"
          : activeTrainingJob
            ? "training-only"
            : "empty";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <DashboardWorkspace
        mode={mode}
        userEmail={userEmail}
        credits={{ blue: initialCredits, gold: Math.floor(initialCredits / TRAINING_CREDITS) }}
        models={trainedModels}
        loadingModels={loadingModels}
        selectedModel={selectedModel}
        selectedModelId={selectedModelId}
        activeTrainingJob={activeTrainingJob}
        trainingElapsed={trainingElapsed}
        activeGenerationJob={activeGenerationJob}
        style={style}
        count={numImages}
        background={background}
        attire={attireType}
        generationMessage={generationMessage}
        jobs={modelGenerateJobs}
        newModelContent={
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
        }
        quickEditContent={
          <QuickEditPanel
            photos={quickPhotos}
            prompt={quickPrompt}
            quality={quickQuality}
            numImages={quickNumImages}
            uploading={quickUploading}
            message={quickMessage}
            editJobs={editJobs}
            onDeleteEdit={deleteEditJob}
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
        }
        onSelectModel={handleSelectModel}
        onNewModel={handleNewModel}
        onQuickEdit={handleQuickEdit}
        onStyleChange={setStyle}
        onCountChange={setNumImages}
        onBackgroundChange={setBackground}
        onAttireChange={v => { setAttireType(v); setAttireColor(null); }}
        onGenerate={() => void startGeneration()}
        onOpenImage={setSelectedImageUrl}
      />
      {selectedImageUrl && mode === "model" ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setSelectedImageUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-5xl" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSelectedImageUrl(null)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            <img src={selectedImageUrl} alt="Headshot" className="max-h-[90vh] rounded-xl object-contain" />
          </div>
        </div>
      ) : null}
    </>
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
          className="flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink-soft"
        >
          <ChevronLeft className="h-4 w-4" />
          Cancel
        </button>
        <span className="text-line-strong">/</span>
        <p className="text-sm font-semibold text-ink">New model</p>
      </div>

      <div className="max-w-lg space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-soft">Model name</label>
          <input
            type="text"
            value={modelName}
            onChange={e => onModelNameChange(e.target.value)}
            placeholder="e.g. Alex, Jordan…"
            maxLength={60}
            disabled={uploading || !!uploadedUrls || trainingCreating}
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:opacity-60"
          />
        </div>

        {!uploadedUrls ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-ink-soft">
                Photos ({MIN_PHOTOS}–{MAX_PHOTOS})
              </label>
              <span className="text-sm text-ink-muted">
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
              className="flex min-h-32 w-full flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-6 py-6 text-center transition-colors hover:border-navy hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="mb-2 h-6 w-6 text-ink-muted" />
              <span className="text-sm font-medium text-ink-soft">Drag or click to select</span>
              <span className="mt-1 text-xs text-ink-muted">JPG or PNG · Max 10 MB per photo</span>
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
                    className="relative aspect-square overflow-hidden rounded-md border border-line bg-bg-2"
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
                      <X className="h-3 w-3 text-ink-soft" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {formMessage && (
              <p className={cn("mt-3 text-sm", uploading ? "text-ink-soft" : "text-red-600")}>
                {formMessage}
              </p>
            )}

            <div className="mt-5">
              {photos.length >= MIN_PHOTOS ? (
                <Button
                  type="button"
                  onClick={onUpload}
                  disabled={uploading}
                  variant="pill"
                size="pill"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {uploading ? (formMessage ?? "Uploading...") : "Confirm photos"}
                </Button>
              ) : (
                <p className="text-sm text-ink-muted">
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
                variant="pill"
                size="pill"
              >
                {trainingCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                {trainingCreating ? "Starting..." : "Train model"}
              </Button>
              {formMessage ? (
                <p className="text-sm text-red-600">{formMessage}</p>
              ) : (
                <p className="text-sm text-ink-muted">
                  Costs {TRAINING_CREDITS} credits · Takes 15–30 minutes.
                </p>
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
  editJobs,
  onDeleteEdit,
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
  editJobs: GenerateJob[];
  onDeleteEdit: (id: string) => void;
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
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink-soft"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-line-strong">/</span>
          <p className="font-semibold text-ink">Quick GPT edit</p>
        </div>
        {signedUrls?.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            className="border-line text-ink-soft hover:bg-bg"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Generate again
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        {isGenerating ? (
          <div className="mb-8 rounded-xl border border-line bg-surface p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-2">
                <Loader2 className="h-5 w-5 animate-spin text-ink-soft" />
              </div>
              <div>
                <p className="font-medium text-ink">Generating with GPT Image 2...</p>
                <p className="mt-0.5 text-sm text-ink-muted">
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
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Results</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void downloadAll(signedUrls)}
                className="border-line text-ink-soft hover:bg-bg"
              >
                <Download className="h-3.5 w-3.5" />
                Download all
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {signedUrls.map((url, i) => (
                <div key={url} className="overflow-hidden rounded-xl border border-line bg-surface">
                  <button
                    type="button"
                    onClick={() => onSelectImage(url)}
                    className="relative block aspect-square w-full bg-bg-2"
                  >
                    <img
                      src={url}
                      alt={`Edited headshot ${i + 1}`}
                      className="h-full w-full object-cover transition-opacity hover:opacity-90"
                    />
                  </button>
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-xs font-medium text-ink-soft">#{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => void downloadUrl(url, `gpt-headshot-${i + 1}.jpg`)}
                      className="text-ink-muted transition-colors hover:text-ink-soft"
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
          <div className="max-w-3xl rounded-xl border border-line bg-surface p-6">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-ink-muted">
              GPT Image 2 edit
            </p>

            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-ink-soft">
                  Reference photos ({QUICK_MIN_PHOTOS}-{MAX_PHOTOS})
                </label>
                <span className="text-sm text-ink-muted">{photos.length} / {MAX_PHOTOS}</span>
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
                className="flex min-h-28 w-full flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-bg px-6 py-6 text-center transition-colors hover:border-navy hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="mb-2 h-6 w-6 text-ink-muted" />
                <span className="text-sm font-medium text-ink-soft">Drag or click to select</span>
                <span className="mt-1 text-xs text-ink-muted">JPG or PNG · More photos improve consistency</span>
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
                    <div key={photo.id} className="relative aspect-square overflow-hidden rounded-md border border-line bg-bg-2">
                      <Image src={photo.previewUrl} alt="" fill unoptimized className="object-cover" />
                      <button
                        type="button"
                        onClick={() => onRemovePhoto(photo.id)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-white"
                      >
                        <X className="h-3 w-3 text-ink-soft" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-ink-soft">Prompt</label>
              <textarea
                value={prompt}
                onChange={e => onPromptChange(e.target.value)}
                rows={5}
                maxLength={2000}
                className="w-full resize-none rounded-lg border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
              />
            </div>

            <div className="mb-6 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2.5 text-sm font-medium text-ink-soft">Quality</p>
                <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
                  {(["low", "medium", "high"] as const).map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onQualityChange(q)}
                      className={cn(
                        "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all",
                        quality === q ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft"
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2.5 text-sm font-medium text-ink-soft">Count</p>
                <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
                  {IMAGE_COUNTS.map(count => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onNumImagesChange(count)}
                      className={cn(
                        "rounded-md px-4 py-1.5 text-sm font-medium transition-all",
                        numImages === count ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft"
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  {numImages} {numImages === 1 ? "credit" : "credits"} · 1 credit per photo
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={onGenerate}
                disabled={uploading || photos.length < QUICK_MIN_PHOTOS}
                variant="pill"
                size="pill"
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
                  <p className={cn("text-sm", uploading ? "text-ink-soft" : "text-red-600")}>{message}</p>
                ))}
            </div>
          </div>
        )}

        {/* Saved Quick GPT edits */}
        {editJobs.length > 0 && (
          <div className="mt-8">
            <ResultsHistory jobs={editJobs} kind="edit" onDelete={onDeleteEdit} />
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
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-8">
        <h1 className="font-semibold text-ink">{modelName}</h1>
        {signedUrls?.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            className="border-line text-ink-soft hover:bg-bg"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Generate again
          </Button>
        ) : null}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {isGenerating ? (
          <div className="mb-8 rounded-xl border border-line bg-surface p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-2">
                <Loader2 className="h-5 w-5 animate-spin text-ink-soft" />
              </div>
              <div>
                <p className="font-medium text-ink">Generating headshots…</p>
                <p className="mt-0.5 text-sm text-ink-muted">
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
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
                Results
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void downloadAll(signedUrls)}
                className="border-line text-ink-soft hover:bg-bg"
              >
                <Download className="h-3.5 w-3.5" />
                Download all
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {signedUrls.map((url, i) => (
                <div
                  key={url}
                  className="overflow-hidden rounded-xl border border-line bg-surface"
                >
                  <button
                    type="button"
                    onClick={() => onSelectImage(url)}
                    className="relative block aspect-square w-full bg-bg-2"
                  >
                    <img
                      src={url}
                      alt={`Headshot ${i + 1}`}
                      className="h-full w-full object-cover transition-opacity hover:opacity-90"
                    />
                  </button>
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-xs font-medium text-ink-soft">#{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => void downloadUrl(url, `headshot-${i + 1}.jpg`)}
                      className="text-ink-muted transition-colors hover:text-ink-soft"
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
          <div className="mb-8 rounded-xl border border-line bg-surface p-6">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-ink-muted">
              New generation
            </p>

            {/* Style */}
            <div className="mb-5">
              <p className="mb-2.5 text-sm font-medium text-ink-soft">Style</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {STYLE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onStyleChange(opt.value)}
                    className={cn(
                      "rounded-lg border p-3.5 text-left transition-all",
                      style === opt.value
                        ? "border-navy bg-navy text-navy-foreground"
                        : "border-line bg-bg text-ink-soft hover:border-line-strong hover:bg-surface"
                    )}
                  >
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span
                      className={cn(
                        "mt-1 block text-xs leading-relaxed",
                        style === opt.value ? "text-navy-foreground/70" : "text-ink-muted"
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
              <p className="mb-2.5 text-sm font-medium text-ink-soft">
                Background{" "}
                <span className="font-normal text-ink-muted">(optional)</span>
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
                        ? "border-navy bg-navy text-navy-foreground"
                        : "border-line bg-surface text-ink-soft hover:border-line-strong"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Attire */}
            <div className="mb-5">
              <p className="mb-2.5 text-sm font-medium text-ink-soft">
                Attire{" "}
                <span className="font-normal text-ink-muted">(optional)</span>
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
                        ? "border-navy bg-navy text-navy-foreground"
                        : "border-line bg-surface text-ink-soft hover:border-line-strong"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Color swatches — only when an attire type is selected */}
              {attireType && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-ink-soft">Color</p>
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
                            ? "border-navy scale-110"
                            : "border-transparent hover:border-line-strong"
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
              <p className="mb-2.5 text-sm font-medium text-ink-soft">Count</p>
              <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
                {IMAGE_COUNTS.map(count => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onNumImagesChange(count)}
                    className={cn(
                      "rounded-md px-4 py-1.5 text-sm font-medium transition-all",
                      numImages === count
                        ? "bg-surface text-ink shadow-sm"
                        : "text-ink-muted hover:text-ink-soft"
                    )}
                  >
                    {count} {count === 1 ? "photo" : "photos"}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                {numImages} {numImages === 1 ? "credit" : "credits"} · 1 credit per photo
              </p>
            </div>

            {/* Generate */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={onGenerate}
                variant="pill"
                size="pill"
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
          <ResultsHistory jobs={modelGenerateJobs} />
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

// ── Results history (per-model generates, or Quick GPT edits with delete) ──────

const HISTORY_PAGE_SIZE = 10;

function ResultsHistory({
  jobs,
  kind = "generate",
  onDelete
}: {
  jobs: GenerateJob[];
  kind?: "generate" | "edit";
  onDelete?: (id: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const doneJobs = jobs.filter(j => j.status === "done");
  if (doneJobs.length === 0) return null;

  const visibleJobs = doneJobs.slice(0, visibleCount);
  const remaining = doneJobs.length - visibleCount;

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">
        History
      </p>
      <div className="space-y-2">
        {visibleJobs.map(job => (
          <HistoryRow
            key={job.id}
            job={job}
            kind={kind}
            onOpenImage={setSelectedImage}
            onDelete={onDelete}
          />
        ))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleCount(v => v + HISTORY_PAGE_SIZE)}
          className="mt-3 text-xs text-ink-muted transition-colors hover:text-ink-soft"
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
  kind = "generate",
  onOpenImage,
  onDelete
}: {
  job: GenerateJob;
  kind?: "generate" | "edit";
  onOpenImage: (url: string) => void;
  onDelete?: (id: string) => void;
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
  const label = kind === "edit" ? "GPT edit" : styleLabel;
  const count = (job.input as { num_images?: number } | null)?.num_images ?? thumbnails.length;
  const date = new Date(job.completedAt ?? job.createdAt).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setIsExpanded(v => !v)}
          className="flex flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg"
        >
        {/* Thumbnails or skeleton placeholders */}
        <div className="flex shrink-0 gap-0.5">
          {signedUrls === null
            ? Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                <div key={i} className="h-10 w-10 animate-pulse rounded-md bg-bg-2" />
              ))
            : thumbnails.map((url, i) => (
                <div key={i} className="h-10 w-10 overflow-hidden rounded-md bg-bg-2">
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </div>
              ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {label} · {count} {count === 1 ? "photo" : "photos"}
          </p>
          <p className="text-xs text-ink-muted">{date}</p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ink-muted transition-transform",
            isExpanded && "rotate-180"
          )}
        />
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Delete this result? The images are removed permanently.")) {
                onDelete(job.id);
              }
            }}
            className="shrink-0 self-stretch px-4 text-ink-muted transition-colors hover:text-red-600"
            aria-label="Delete result"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="border-t border-line p-4">
          {signedUrls === null ? (
            <div className="flex items-center gap-2 py-2 text-sm text-ink-muted">
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
                  className="border-line text-ink-soft hover:bg-bg"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download all
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {signedUrls.map((url, i) => (
                  <div
                    key={url}
                    className="overflow-hidden rounded-lg border border-line"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenImage(url)}
                      className="block aspect-square w-full bg-bg-2"
                    >
                      <img
                        src={url}
                        alt={`Headshot ${i + 1}`}
                        className="h-full w-full object-cover transition-opacity hover:opacity-90"
                      />
                    </button>
                    <div className="flex items-center justify-between p-2">
                      <span className="text-xs text-ink-muted">#{i + 1}</span>
                      <button
                        type="button"
                        onClick={() => void downloadUrl(url, `headshot-${i + 1}.jpg`)}
                        className="text-ink-muted transition-colors hover:text-ink-soft"
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
            <p className="py-1 text-sm text-ink-muted">Could not load photos.</p>
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
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-navy">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h2 className="text-xl font-semibold text-ink">Get started with your first model</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
        Upload 10–15 photos of yourself to train a personalized model. Each model can be used to
        generate unlimited headshots.
      </p>
      <Button
        type="button"
        onClick={onNewModel}
        variant="pill"
        size="pill"
        className="mt-6"
      >
        <Plus className="h-4 w-4" />
        Train your first model
      </Button>
    </div>
  );
}
