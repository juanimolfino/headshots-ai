"use client";

/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  Images,
  Info,
  Loader2,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Smartphone,
  Trash2,
  Upload,
  User,
  Wallet,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobToasts, type JobToastItem } from "@/components/ui/job-toasts";
import {
  DashboardWorkspace,
  type ActiveGenerationJob,
  type CountValue,
  type DashboardMode
} from "@/components/dashboard/dashboard-ui";
import {
  collectNewJobToastEvents,
  markJobToastEventsSeen,
  type ToastJob
} from "@/lib/job-toast-events";
import {
  getInsufficientCreditsMessage,
  getJobProgressInfo,
  getRefundCopy,
  getUserFacingJobError,
  hasEnoughCredits,
  splitJobsByStatus
} from "@/lib/job-ux";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_PHOTOS = 10;
const MAX_PHOTOS = 15;
const QUICK_MIN_PHOTOS = 1;
const QUICK_MAX_PHOTOS = 4;
const TRAINING_GOLD_CREDITS = 1;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const QUICK_OPTIMIZE_THRESHOLD_BYTES = 4 * 1024 * 1024;
const QUICK_MAX_UPLOAD_DIMENSION = 2048;
const QUICK_UPLOAD_JPEG_QUALITY = 0.92;
const POLL_INTERVAL_MS = 8000;
const SUPPORT_EMAIL = "juanimolfinooo@gmail.com";
const FALLBACK_CREATED_AT = "1970-01-01T00:00:00.000Z";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_UPLOAD_DIMENSION = 1024;
const UPLOAD_JPEG_QUALITY = 0.88;
const ACTIVE_JOB_STATUSES = new Set<JobStatus>(["pending", "processing"]);

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

const QUICK_QUALITY_OPTIONS = [
  { label: "Draft", value: "low", blueCost: 1 },
  { label: "Standard", value: "medium", blueCost: 2 },
  { label: "Premium", value: "high", blueCost: 3 }
] as const;

const QUICK_PRESET_OPTIONS = [
  {
    label: "Professional",
    value: "professional" as const,
    description: "Studio lighting, polished profile photo, clean business look.",
    prompt:
      "Create a professional headshot using these reference photos. Preserve the person's identity, facial features, and natural expression. Use clean studio lighting, realistic skin texture, a polished outfit, and a neutral background."
  },
  {
    label: "Cinematic",
    value: "cinematic" as const,
    description: "Editorial lighting, richer contrast, modern portrait mood.",
    prompt:
      "Create a cinematic editorial headshot using these reference photos. Preserve the person's identity, facial features, and natural expression. Use dramatic but realistic lighting, refined contrast, shallow depth of field, and a polished modern portrait style."
  },
  {
    label: "Free",
    value: "free" as const,
    description: "Write a custom prompt and tune the output settings.",
    prompt: ""
  }
] as const;

const QUICK_IMAGE_SIZE_OPTIONS = [
  {
    label: "Original size",
    value: "auto" as const,
    description: "Auto",
    icon: Images
  },
  {
    label: "Phone vertical",
    value: "portrait_4_3" as const,
    description: "3:4",
    icon: Smartphone
  },
  {
    label: "Desktop horizontal",
    value: "landscape_16_9" as const,
    description: "16:9",
    icon: Monitor
  }
] as const;

const QUICK_ENGINE_OPTIONS = [
  {
    label: "GPT Image 2",
    value: "gpt-image-2",
    disabled: false
  },
  {
    label: "Nano Banana Pro",
    value: "gemini-3-pro-image",
    disabled: false
  }
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

type StyleValue = "professional" | "cinematic" | "natural";
type JobStatus = "pending" | "processing" | "done" | "failed";
type GenerationJobKind = "generate" | "edit";
type QuickEditEngine = (typeof QUICK_ENGINE_OPTIONS)[number]["value"];
type QuickEditPreset = (typeof QUICK_PRESET_OPTIONS)[number]["value"];
type QuickImageSize = (typeof QUICK_IMAGE_SIZE_OPTIONS)[number]["value"];

type TrainingJob = {
  id: string;
  status: JobStatus;
  input: Record<string, unknown> | null;
  result: { lora_url?: string; trigger_word?: string } | null;
  error: string | null;
  creditsUsed: number;
  creditKind: "blue" | "gold";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type GenerateJob = {
  id: string;
  status: JobStatus;
  input: Record<string, unknown> | null;
  result: string[] | null;
  error: string | null;
  creditsUsed: number;
  creditKind: "blue" | "gold";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type SelectedPhoto = { id: string; file: File; previewUrl: string };
type DashboardCredits = {
  blue: number;
  gold: number;
  subscriptionBlue?: number;
  subscriptionGold?: number;
  packBlue?: number;
  packGold?: number;
  subscriptionCurrentPeriodEnd?: Date | string | null;
  subscriptionStatus?: string;
};

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

function isActiveJob(job: GenerateJob) {
  return ACTIVE_JOB_STATUSES.has(job.status);
}

function getJobCount(job: GenerateJob): CountValue {
  const count = (job.input as { num_images?: unknown } | null)?.num_images;
  return count === 1 || count === 2 || count === 4 ? count : 1;
}

function getJobStyle(job: GenerateJob): StyleValue {
  const style = (job.input as { style?: unknown } | null)?.style;
  return style === "cinematic" || style === "natural" || style === "professional"
    ? style
    : "professional";
}

function getJobBackground(job: GenerateJob): "white" | "gray" | "dark" | "outdoor" | null {
  const background = (job.input as { background?: unknown } | null)?.background;
  return background === "white" || background === "gray" || background === "dark" || background === "outdoor"
    ? background
    : null;
}

function getQuickEditEngineLabel(jobOrEngine: GenerateJob | QuickEditEngine | undefined) {
  const engine = typeof jobOrEngine === "string"
    ? jobOrEngine
    : (jobOrEngine?.input as { engine?: unknown } | null)?.engine;
  return engine === "gemini-3-pro-image" ? "Nano Banana Pro" : "GPT Image 2";
}

function getQuickEditBlueCost(quality: "low" | "medium" | "high", count: (typeof IMAGE_COUNTS)[number]) {
  const option = QUICK_QUALITY_OPTIONS.find(item => item.value === quality) ?? QUICK_QUALITY_OPTIONS[0];
  return option.blueCost * count;
}

function toTrainingToastJob(job: TrainingJob): ToastJob {
  return {
    id: job.id,
    type: "headshot-training",
    status: job.status,
    error: job.error,
    creditsUsed: job.creditsUsed,
    creditKind: job.creditKind
  };
}

function toHeadshotToastJob(job: GenerateJob, type: "headshot-generate" | "headshot-edit"): ToastJob {
  return {
    id: job.id,
    type,
    status: job.status,
    error: job.error,
    creditsUsed: job.creditsUsed,
    creditKind: job.creditKind
  };
}

function toActiveGenerationJob(
  job: GenerateJob,
  title?: string,
  kind: GenerationJobKind = "generate",
  lastUpdatedAt?: string | null
): ActiveGenerationJob {
  const progress = getJobProgressInfo({
    type: kind === "edit" ? "headshot-edit" : "headshot-generate",
    status: job.status,
    createdAt: job.createdAt,
    lastUpdatedAt
  });
  return {
    id: job.id,
    status: job.status,
    progress: progress.progress,
    stage: progress.stage,
    statusText: progress.statusText,
    lastUpdatedLabel: progress.lastUpdatedLabel,
    isOverEta: progress.isOverEta,
    style: getJobStyle(job),
    title,
    count: getJobCount(job),
    background: getJobBackground(job),
    elapsed: Math.max(0, Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 1000)),
    createdAt: job.createdAt
  };
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

function optimizeQuickEditImage(file: File): Promise<File> {
  if (file.size <= QUICK_OPTIMIZE_THRESHOLD_BYTES) return Promise.resolve(file);

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, QUICK_MAX_UPLOAD_DIMENSION / Math.max(w, h));
      if (scale === 1 && file.type === "image/jpeg") {
        resolve(file);
        return;
      }

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
          const optimized = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
            type: "image/jpeg"
          });
          resolve(optimized.size < file.size ? optimized : file);
        },
        "image/jpeg",
        QUICK_UPLOAD_JPEG_QUALITY
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

function readDismissedFailedJobIds(storageKey: string) {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export function HeadshotsApp({
  userEmail,
  initialCredits
}: {
  userEmail: string;
  initialCredits: DashboardCredits;
}) {
  const [credits, setCredits] = useState<DashboardCredits>(initialCredits);
  const dismissedFailedStorageKey = `headshots:dismissed-failed-jobs:${userEmail}`;
  const [toasts, setToasts] = useState<JobToastItem[]>([]);
  const [dismissedFailedJobIds, setDismissedFailedJobIds] = useState<Set<string>>(
    () => readDismissedFailedJobIds(dismissedFailedStorageKey)
  );
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [accountDeletionMessage, setAccountDeletionMessage] = useState<string | null>(null);
  const seenToastKeysRef = useRef<Set<string>>(new Set());
  const primedToastGroupsRef = useRef<Record<"training" | "generate" | "edit", boolean>>({
    training: false,
    generate: false,
    edit: false
  });

  // Models
  const [trainedModels, setTrainedModels] = useState<TrainingJob[]>([]);
  const [failedTrainingJobs, setFailedTrainingJobs] = useState<TrainingJob[]>([]);
  const [activeTrainingJob, setActiveTrainingJob] = useState<TrainingJob | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [trainingElapsed, setTrainingElapsed] = useState(0);
  const [modelsLastUpdatedAt, setModelsLastUpdatedAt] = useState<string | null>(null);
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
  const [photoConsentAccepted, setPhotoConsentAccepted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [trainingCreating, setTrainingCreating] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);

  // Quick edit form
  const [quickPhotos, setQuickPhotos] = useState<SelectedPhoto[]>([]);
  const [quickPreset, setQuickPreset] = useState<QuickEditPreset>("professional");
  const [quickPrompt, setQuickPrompt] = useState<string>(QUICK_PRESET_OPTIONS[0].prompt);
  const [quickQuality, setQuickQuality] = useState<"low" | "medium" | "high">("low");
  const [quickImageSize, setQuickImageSize] = useState<QuickImageSize>("auto");
  const [quickEngine, setQuickEngine] = useState<QuickEditEngine>("gpt-image-2");
  const [quickNumImages, setQuickNumImages] = useState<(typeof IMAGE_COUNTS)[number]>(1);
  const [quickLegalAccepted, setQuickLegalAccepted] = useState(false);
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
  const [generationJobKind, setGenerationJobKind] = useState<GenerationJobKind | null>(null);
  const [generationStatus, setGenerationStatus] = useState<JobStatus | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationCreditsUsed, setGenerationCreditsUsed] = useState<number>(0);
  const [generationCreditKind, setGenerationCreditKind] = useState<"blue" | "gold">("blue");
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<string[] | null>(null);
  const [signedUrlsKind, setSignedUrlsKind] = useState<GenerationJobKind | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [generationCreatedAt, setGenerationCreatedAt] = useState<string | null>(null);
  const generationStartRef = useRef<number | null>(null);
  const refreshedFailedJobIdsRef = useRef<Set<string>>(new Set());

  // History (all generate jobs, filtered per model client-side)
  const [generateJobs, setGenerateJobs] = useState<GenerateJob[]>([]);
  const [generateJobsLastUpdatedAt, setGenerateJobsLastUpdatedAt] = useState<string | null>(null);

  // Quick edit history (all headshot-edit jobs)
  const [editJobs, setEditJobs] = useState<GenerateJob[]>([]);
  const [editJobsLastUpdatedAt, setEditJobsLastUpdatedAt] = useState<string | null>(null);

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

  const dismissToast = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== toastId));
  }, []);

  const emitJobToastEvents = useCallback((
    jobs: ToastJob[],
    group: "training" | "generate" | "edit",
    options: { force?: boolean } = {}
  ) => {
    if (!primedToastGroupsRef.current[group] && !options.force) {
      markJobToastEventsSeen(jobs, seenToastKeysRef.current);
      primedToastGroupsRef.current[group] = true;
      return;
    }
    primedToastGroupsRef.current[group] = true;
    const events = collectNewJobToastEvents(jobs, seenToastKeysRef.current);
    if (events.length === 0) return;
    setToasts(prev => {
      const next = [
        ...prev.filter(toast => !events.some(event => event.key === toast.key)),
        ...events.map(event => ({ ...event, id: event.key }))
      ];
      return next.slice(-6);
    });
  }, []);

  const loadCredits = useCallback(async () => {
    const res = await fetch("/api/credits", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { credits?: DashboardCredits };
    if (data.credits) setCredits(data.credits);
  }, []);

  const refreshCreditsForNewFailures = useCallback((jobs: Array<{ id: string; status: JobStatus }>) => {
    const nextFailed = jobs.filter(job => job.status === "failed" && !refreshedFailedJobIdsRef.current.has(job.id));
    if (nextFailed.length === 0) return;
    for (const job of nextFailed) refreshedFailedJobIdsRef.current.add(job.id);
    void loadCredits();
  }, [loadCredits]);

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
      setFailedTrainingJobs(all.filter(j => j.status === "failed"));
      setSelectedModelId(prev => (prev ? prev : (done[0]?.id ?? null)));
      const active = all.find(j => j.status === "pending" || j.status === "processing") ?? null;
      setModelsLastUpdatedAt(new Date().toISOString());
      refreshCreditsForNewFailures(all);
      emitJobToastEvents(all.map(toTrainingToastJob), "training");
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
  }, [emitJobToastEvents, refreshCreditsForNewFailures]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/jobs?type=headshot-generate&limit=50");
    if (!res.ok) return;
    const data = (await res.json()) as { jobs?: GenerateJob[] };
    const jobs = data.jobs ?? [];
    setGenerateJobs(jobs);
    setGenerateJobsLastUpdatedAt(new Date().toISOString());
    refreshCreditsForNewFailures(jobs);
    emitJobToastEvents(jobs.map(job => toHeadshotToastJob(job, "headshot-generate")), "generate");
  }, [emitJobToastEvents, refreshCreditsForNewFailures]);

  const loadEditHistory = useCallback(async () => {
    const res = await fetch("/api/jobs?type=headshot-edit&limit=50");
    if (!res.ok) return;
    const data = (await res.json()) as { jobs?: GenerateJob[] };
    const jobs = data.jobs ?? [];
    setEditJobs(jobs);
    setEditJobsLastUpdatedAt(new Date().toISOString());
    refreshCreditsForNewFailures(jobs);
    emitJobToastEvents(jobs.map(job => toHeadshotToastJob(job, "headshot-edit")), "edit");
  }, [emitJobToastEvents, refreshCreditsForNewFailures]);

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
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    let attempts = 0;
    const poll = () => {
      attempts += 1;
      void loadCredits();
      if (attempts >= 8) window.clearInterval(id);
    };
    const id = window.setInterval(poll, 2000);
    poll();

    params.delete("checkout");
    const nextSearch = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);

    return () => window.clearInterval(id);
  }, [loadCredits]);

  useEffect(() => {
    if (!activeTrainingJob) return;
    const id = setInterval(loadModels, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeTrainingJob, loadModels]);

  useEffect(() => {
    const hasActiveGenerateJobs = generateJobs.some(job => ACTIVE_JOB_STATUSES.has(job.status));
    const hasActiveEditJobs = editJobs.some(job => ACTIVE_JOB_STATUSES.has(job.status));
    if (!hasActiveGenerateJobs && !hasActiveEditJobs) return;

    const poll = () => {
      if (hasActiveGenerateJobs) void loadHistory();
      if (hasActiveEditJobs) void loadEditHistory();
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [editJobs, generateJobs, loadEditHistory, loadHistory]);

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
      const data = (await res.json()) as {
        status: JobStatus;
        error: string | null;
        creditsUsed?: number;
        creditKind?: "blue" | "gold";
      };
      const now = new Date().toISOString();
      if (generationJobKind === "edit") setEditJobsLastUpdatedAt(now);
      else setGenerateJobsLastUpdatedAt(now);
      setGenerationStatus(data.status);
      setGenerationError(data.error);
      if (typeof data.creditsUsed === "number") setGenerationCreditsUsed(data.creditsUsed);
      if (data.creditKind === "blue" || data.creditKind === "gold") setGenerationCreditKind(data.creditKind);
      if (data.status === "done" || data.status === "failed") {
        emitJobToastEvents([{
          id: generationJobId,
          type: generationJobKind === "edit" ? "headshot-edit" : "headshot-generate",
          status: data.status,
          error: data.error,
          creditsUsed: data.creditsUsed ?? generationCreditsUsed,
          creditKind: data.creditKind ?? generationCreditKind
        }], generationJobKind === "edit" ? "edit" : "generate", { force: true });
      }
      if (data.status === "done") {
        const sRes = await fetch(`/api/jobs/${generationJobId}/signed-urls`, { method: "POST" });
        const sData = (await sRes.json()) as { signedUrls?: string[] };
        setSignedUrls(sData.signedUrls ?? []);
        setSignedUrlsKind(generationJobKind);
        void loadHistory();
        void loadEditHistory();
      }
      if (data.status === "failed") {
        refreshCreditsForNewFailures([{ id: generationJobId, status: "failed" }]);
        void loadHistory();
        void loadEditHistory();
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [generationJobId, generationJobKind, generationStatus, signedUrls, loadHistory, loadEditHistory, refreshCreditsForNewFailures, emitJobToastEvents, generationCreditsUsed, generationCreditKind]);

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
  }

  function handleNewModel() {
    setSelectedModelId(null);
    setShowNewModelForm(true);
    setShowQuickEditForm(false);
  }

  function handleQuickEdit() {
    setSelectedModelId(null);
    setShowNewModelForm(false);
    setShowQuickEditForm(true);
  }

  function handleQuickPresetChange(nextPreset: QuickEditPreset) {
    setQuickPreset(nextPreset);
    const preset = QUICK_PRESET_OPTIONS.find(option => option.value === nextPreset);
    if (!preset) return;
    if (nextPreset === "free") {
      const fixedPrompts = new Set<string>(QUICK_PRESET_OPTIONS.map(option => option.prompt).filter(Boolean));
      setQuickPrompt(prev => (fixedPrompts.has(prev) ? "" : prev));
    } else {
      setQuickPrompt(preset.prompt);
    }
  }

  function resetGeneration() {
    setGenerationJobId(null);
    setGenerationJobKind(null);
    setGenerationStatus(null);
    setGenerationError(null);
    setGenerationCreditsUsed(0);
    setGenerationCreditKind("blue");
    setGenerationMessage(null);
    setSignedUrls(null);
    setSignedUrlsKind(null);
    setSelectedImageUrl(null);
    setGenerationElapsed(0);
    setGenerationCreatedAt(null);
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
    const slots = QUICK_MAX_PHOTOS - quickPhotos.length;
    const toAdd = accepted.slice(0, Math.max(slots, 0));
    for (const p of accepted.slice(toAdd.length)) URL.revokeObjectURL(p.previewUrl);
    const skipped = accepted.length - toAdd.length;
    setQuickPhotos(prev => [...prev, ...toAdd]);
    if (skipped > 0) setQuickMessage(`You can upload up to ${QUICK_MAX_PHOTOS} reference photos.`);
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
    if (!photoConsentAccepted) {
      setFormMessage("Aceptá el procesamiento de tus fotos para entrenar el modelo.");
      return;
    }
    if (!hasEnoughCredits(credits.gold, TRAINING_GOLD_CREDITS)) {
      setFormMessage(getInsufficientCreditsMessage({
        kind: "gold",
        required: TRAINING_GOLD_CREDITS,
        available: credits.gold
      }));
      return;
    }
    if (photos.length < MIN_PHOTOS) {
      setFormMessage(`Upload at least ${MIN_PHOTOS} photos.`);
      return;
    }
    setUploading(true);
    setFormMessage(null);
    try {
      const consentRes = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legal: true, photoProcessing: true })
      });
      if (!consentRes.ok) throw new Error("No pudimos registrar el consentimiento. Probá de nuevo.");

      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        setFormMessage(`Uploading photo ${i + 1} of ${photos.length}...`);
        const file = await compressImage(photos[i].file);
        const initRes = await fetch("/api/upload/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
            purpose: "training-source"
          })
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
    if (!hasEnoughCredits(credits.gold, TRAINING_GOLD_CREDITS)) {
      setFormMessage(getInsufficientCreditsMessage({
        kind: "gold",
        required: TRAINING_GOLD_CREDITS,
        available: credits.gold
      }));
      return;
    }
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
      if (res.status === 402) throw new Error(getInsufficientCreditsMessage({
        kind: "gold",
        required: TRAINING_GOLD_CREDITS,
        available: credits.gold
      }));
      if (!res.ok) throw new Error(getUserFacingJobError(data.error).description);
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
    if (!hasEnoughCredits(credits.blue, numImages)) {
      setGenerationMessage(getInsufficientCreditsMessage({
        kind: "blue",
        required: numImages,
        available: credits.blue
      }));
      return;
    }
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
      setGenerationMessage(getInsufficientCreditsMessage({
        kind: "blue",
        required: numImages,
        available: credits.blue
      }));
      return;
    }
    if (!res.ok) {
      setGenerationMessage(getUserFacingJobError(data.error).description);
      return;
    }
    const startedAt = Date.now();
    generationStartRef.current = startedAt;
    setGenerationCreatedAt(new Date(startedAt).toISOString());
    setGenerationJobId(data.jobId!);
    setGenerationJobKind("generate");
    setGenerationStatus("pending");
    setGenerationError(null);
    setGenerationCreditsUsed(numImages);
    setGenerationCreditKind("blue");
    setSignedUrls(null);
    setSignedUrlsKind(null);
    setGenerationElapsed(0);
    await loadHistory();
    void loadCredits();
  }

  async function startQuickEdit() {
    const quickCost = getQuickEditBlueCost(quickQuality, quickNumImages);
    if (!quickLegalAccepted) {
      setQuickMessage("Aceptá los términos y la política de privacidad para subir fotos.");
      return;
    }
    if (!hasEnoughCredits(credits.blue, quickCost)) {
      setQuickMessage(getInsufficientCreditsMessage({
        kind: "blue",
        required: quickCost,
        available: credits.blue
      }));
      return;
    }
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
      const consentRes = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legal: true })
      });
      if (!consentRes.ok) throw new Error("No pudimos registrar el consentimiento. Probá de nuevo.");

      const urls: string[] = [];
      for (let i = 0; i < quickPhotos.length; i++) {
        setQuickMessage(`Uploading photo ${i + 1} of ${quickPhotos.length}...`);
        const file = await optimizeQuickEditImage(quickPhotos[i].file);
        const initRes = await fetch("/api/upload/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
            purpose: "quick-edit-reference"
          })
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
            engine: quickEngine,
            quality: quickQuality,
            image_size: quickImageSize,
            num_images: quickNumImages
          }
        })
      });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (res.status === 402) throw new Error(getInsufficientCreditsMessage({
        kind: "blue",
        required: quickCost,
        available: credits.blue
      }));
      if (!res.ok) throw new Error(getUserFacingJobError(data.error).description);

      const startedAt = Date.now();
      generationStartRef.current = startedAt;
      setGenerationCreatedAt(new Date(startedAt).toISOString());
      setGenerationJobId(data.jobId!);
      setGenerationJobKind("edit");
      setGenerationStatus("pending");
      setGenerationError(null);
      setGenerationCreditsUsed(quickCost);
      setGenerationCreditKind("blue");
      setSignedUrls(null);
      setSignedUrlsKind(null);
      setGenerationElapsed(0);
      setQuickMessage(null);
      await loadEditHistory();
      void loadCredits();
    } catch (err) {
      setQuickMessage(err instanceof Error ? err.message : "Could not generate photos.");
    } finally {
      setQuickUploading(false);
    }
  }

  async function startRetriedHeadshotJob(job: GenerateJob, kind: GenerationJobKind) {
    const cost = Math.max(1, job.creditsUsed);
    if (!hasEnoughCredits(credits.blue, cost)) {
      const message = getInsufficientCreditsMessage({ kind: "blue", required: cost, available: credits.blue });
      if (kind === "edit") {
        setQuickMessage(message);
        setShowQuickEditForm(true);
      } else {
        setGenerationMessage(message);
      }
      return;
    }

    if (!job.input) return;
    if (kind === "edit") {
      setShowQuickEditForm(true);
      setShowNewModelForm(false);
      setQuickMessage(null);
    } else {
      setShowQuickEditForm(false);
      setGenerationMessage(null);
    }

    const res = await fetch("/api/jobs/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: kind === "edit" ? "headshot-edit" : "headshot-generate",
        input: job.input
      })
    });
    const data = (await res.json()) as { jobId?: string; error?: string };
    if (res.status === 402) {
      const message = getInsufficientCreditsMessage({ kind: "blue", required: cost, available: credits.blue });
      if (kind === "edit") setQuickMessage(message);
      else setGenerationMessage(message);
      return;
    }
    if (!res.ok || !data.jobId) {
      const message = getUserFacingJobError(data.error).description;
      if (kind === "edit") setQuickMessage(message);
      else setGenerationMessage(message);
      return;
    }

    const startedAt = Date.now();
    generationStartRef.current = startedAt;
    setGenerationCreatedAt(new Date(startedAt).toISOString());
    setGenerationJobId(data.jobId);
    setGenerationJobKind(kind);
    setGenerationStatus("pending");
    setGenerationError(null);
    setGenerationCreditsUsed(cost);
    setGenerationCreditKind("blue");
    setSignedUrls(null);
    setSignedUrlsKind(null);
    setGenerationElapsed(0);
    if (kind === "edit") await loadEditHistory();
    else await loadHistory();
    void loadCredits();
  }

  async function retryTrainingJob(job: TrainingJob) {
    const cost = Math.max(TRAINING_GOLD_CREDITS, job.creditsUsed || TRAINING_GOLD_CREDITS);
    if (!hasEnoughCredits(credits.gold, cost)) {
      setShowNewModelForm(true);
      setFormMessage(getInsufficientCreditsMessage({ kind: "gold", required: cost, available: credits.gold }));
      return;
    }
    if (!job.input) return;

    const res = await fetch("/api/jobs/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "headshot-training",
        input: job.input
      })
    });
    const data = (await res.json()) as { jobId?: string; error?: string };
    if (res.status === 402) {
      setShowNewModelForm(true);
      setFormMessage(getInsufficientCreditsMessage({ kind: "gold", required: cost, available: credits.gold }));
      return;
    }
    if (!res.ok || !data.jobId) {
      setShowNewModelForm(true);
      setFormMessage(getUserFacingJobError(data.error).description);
      return;
    }

    setShowNewModelForm(false);
    setShowQuickEditForm(false);
    setSelectedModelId(data.jobId);
    trainingStartRef.current = Date.now();
    await loadModels();
    void loadCredits();
  }

  function dismissFailedJob(jobId: string) {
    setDismissedFailedJobIds(prev => {
      const next = new Set(prev);
      next.add(jobId);
      try {
        window.localStorage.setItem(dismissedFailedStorageKey, JSON.stringify(Array.from(next)));
      } catch {
        // Local persistence is best-effort only.
      }
      return next;
    });

    if (selectedModelId === jobId) {
      setSelectedModelId(trainedModels[0]?.id ?? null);
    }
    if (generationJobId === jobId) {
      resetGeneration();
    }
  }

  function handleToastAction(toast: JobToastItem) {
    dismissToast(toast.id);

    if (toast.jobType === "headshot-training") {
      setSelectedModelId(toast.jobId);
      setShowNewModelForm(false);
      setShowQuickEditForm(false);
      return;
    }

    if (toast.jobType === "headshot-edit") {
      setSelectedModelId(null);
      setShowNewModelForm(false);
      setShowQuickEditForm(true);
      return;
    }

    const job = generateJobs.find(item => item.id === toast.jobId);
    const loraUrl = (job?.input as { lora_url?: string } | null)?.lora_url;
    const model = trainedModels.find(item => item.result?.lora_url && item.result.lora_url === loraUrl);
    if (model) setSelectedModelId(model.id);
    setShowNewModelForm(false);
    setShowQuickEditForm(false);
  }

  async function handleDeleteAccount() {
    const confirmation = window.prompt(
      "This permanently deletes your account, models, generated images, and personal data. Type DELETE to confirm."
    );
    if (confirmation !== "DELETE") return;

    setAccountDeleting(true);
    setAccountDeletionMessage(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" })
      });
      const data = (await res.json()) as { ok?: boolean; steps?: Array<{ ok: boolean; step: string; message?: string }>; error?: string };
      if (res.ok && data.ok) {
        window.location.href = "/login?message=account-deleted";
        return;
      }
      const failed = data.steps?.filter(step => !step.ok).map(step => step.step).join(", ");
      setAccountDeletionMessage(failed ? `Partial deletion. Failed: ${failed}` : data.error ?? "Could not delete account.");
    } catch (error) {
      setAccountDeletionMessage(error instanceof Error ? error.message : "Could not delete account.");
    } finally {
      setAccountDeleting(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const visibleFailedTrainingJobs = failedTrainingJobs.filter(job => !dismissedFailedJobIds.has(job.id));
  const selectedModel = trainedModels.find(m => m.id === selectedModelId) ?? null;
  const selectedTrainingFailedJob = visibleFailedTrainingJobs.find(m => m.id === selectedModelId) ?? null;

  const modelGenerateJobs = selectedModel
    ? generateJobs.filter(j => {
        const loraUrl = (j.input as { lora_url?: string } | null)?.lora_url;
        const modelLora = selectedModel.result?.lora_url;
        return loraUrl && modelLora && loraUrl === modelLora;
      })
    : [];
  const visibleModelGenerateJobs = modelGenerateJobs.filter(job => job.status !== "failed" || !dismissedFailedJobIds.has(job.id));
  const visibleEditJobs = editJobs.filter(job => job.status !== "failed" || !dismissedFailedJobIds.has(job.id));

  const localActiveGenerationJob: ActiveGenerationJob | null =
    generationJobId && !signedUrls && generationStatus !== "failed"
      ? {
          id: generationJobId,
          status: generationStatus,
          ...getJobProgressInfo({
            type: generationJobKind === "edit" ? "headshot-edit" : "headshot-generate",
            status: generationStatus,
            createdAt: generationCreatedAt ?? FALLBACK_CREATED_AT,
            lastUpdatedAt: generationJobKind === "edit" ? editJobsLastUpdatedAt : generateJobsLastUpdatedAt
          }),
          style,
          title: generationJobKind === "edit" ? getQuickEditEngineLabel(quickEngine) : undefined,
          count: generationJobKind === "edit" ? quickNumImages : numImages,
          background,
          elapsed: generationElapsed,
          createdAt: generationCreatedAt ?? FALLBACK_CREATED_AT
        }
      : null;
  const activeAccountGenerateJob = generateJobs.find(isActiveJob) ?? null;
  const activeSelectedModelJob = visibleModelGenerateJobs.find(isActiveJob) ?? null;
  const activeEditJob = editJobs.find(isActiveJob) ?? null;
  const activeTaskJob =
    activeAccountGenerateJob ? toActiveGenerationJob(activeAccountGenerateJob, undefined, "generate", generateJobsLastUpdatedAt) :
    activeEditJob ? toActiveGenerationJob(activeEditJob, getQuickEditEngineLabel(activeEditJob), "edit", editJobsLastUpdatedAt) :
    localActiveGenerationJob;
  const activeGenerationJob =
    activeSelectedModelJob ? toActiveGenerationJob(activeSelectedModelJob, undefined, "generate", generateJobsLastUpdatedAt) :
    generationJobKind === "generate" ? localActiveGenerationJob : null;

  const mode: DashboardMode = showNewModelForm
    ? "new-model"
    : showQuickEditForm
      ? "quick-edit"
      : loadingModels
        ? "loading"
        : selectedModel
          ? "model"
          : selectedTrainingFailedJob
            ? "training-failed"
          : activeTrainingJob
            ? "training-only"
            : "empty";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <DashboardWorkspace
        mode={mode}
        userEmail={userEmail}
        credits={credits}
        models={trainedModels}
        failedTrainingJobs={visibleFailedTrainingJobs}
        loadingModels={loadingModels}
        selectedModel={selectedModel}
        selectedTrainingFailedJob={selectedTrainingFailedJob}
        selectedModelId={selectedModelId}
        activeTrainingJob={activeTrainingJob}
        trainingElapsed={trainingElapsed}
        trainingLastUpdatedAt={modelsLastUpdatedAt}
        activeTaskJob={activeTaskJob}
        activeGenerationJob={activeGenerationJob}
        style={style}
        count={numImages}
        background={background}
        attire={attireType}
        generationMessage={generationMessage}
        jobs={visibleModelGenerateJobs}
        generationLastUpdatedAt={generateJobsLastUpdatedAt}
        newModelContent={
          <NewModelPanel
            credits={credits}
            modelName={modelName}
            photos={photos}
            uploadedUrls={uploadedUrls}
            photoConsentAccepted={photoConsentAccepted}
            uploading={uploading}
            trainingCreating={trainingCreating}
            formMessage={formMessage}
            fileInputRef={fileInputRef}
            onModelNameChange={setModelName}
            onAddFiles={addFiles}
            onRemovePhoto={removePhoto}
            onPhotoConsentChange={setPhotoConsentAccepted}
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
            credits={credits}
            photos={quickPhotos}
            preset={quickPreset}
            prompt={quickPrompt}
            engine={quickEngine}
            quality={quickQuality}
            imageSize={quickImageSize}
            numImages={quickNumImages}
            legalAccepted={quickLegalAccepted}
            uploading={quickUploading}
            message={quickMessage}
            editJobs={visibleEditJobs}
            onDeleteEdit={deleteEditJob}
            onDismissFailedJob={dismissFailedJob}
            generationJobId={generationJobKind === "edit" ? generationJobId : null}
            generationStatus={generationJobKind === "edit" ? generationStatus : null}
            generationError={generationJobKind === "edit" ? generationError : null}
            generationCreditsUsed={generationJobKind === "edit" ? generationCreditsUsed : 0}
            generationCreditKind={generationJobKind === "edit" ? generationCreditKind : "blue"}
            generationElapsed={generationJobKind === "edit" ? generationElapsed : 0}
            generationCreatedAt={generationJobKind === "edit" ? generationCreatedAt : null}
            generationLastUpdatedAt={editJobsLastUpdatedAt}
            signedUrls={generationJobKind === "edit" && signedUrlsKind === "edit" ? signedUrls : null}
            selectedImageUrl={selectedImageUrl}
            fileInputRef={quickFileInputRef}
            onPresetChange={handleQuickPresetChange}
            onPromptChange={setQuickPrompt}
            onEngineChange={setQuickEngine}
            onQualityChange={setQuickQuality}
            onImageSizeChange={setQuickImageSize}
            onNumImagesChange={setQuickNumImages}
            onLegalAcceptedChange={setQuickLegalAccepted}
            onAddFiles={addQuickFiles}
            onRemovePhoto={removeQuickPhoto}
            onGenerate={() => void startQuickEdit()}
            onReset={resetGeneration}
            onRetryJob={job => void startRetriedHeadshotJob(job, "edit")}
            onSelectImage={setSelectedImageUrl}
            onCloseImage={() => setSelectedImageUrl(null)}
            onCancel={() => {
              if (generationJobKind === "edit" && (signedUrlsKind === "edit" || generationStatus === "failed")) {
                resetGeneration();
                return;
              }
              setShowQuickEditForm(false);
              if (trainedModels[0]) setSelectedModelId(trainedModels[0].id);
            }}
          />
        }
        onSelectModel={handleSelectModel}
        onNewModel={handleNewModel}
        onQuickEdit={handleQuickEdit}
        onRetryTraining={job => void retryTrainingJob(job as TrainingJob)}
        onRetryGeneration={job => void startRetriedHeadshotJob(job as GenerateJob, "generate")}
        onDismissFailedJob={dismissFailedJob}
        onStyleChange={setStyle}
        onCountChange={setNumImages}
        onBackgroundChange={setBackground}
        onAttireChange={v => { setAttireType(v); setAttireColor(null); }}
        onGenerate={() => void startGeneration()}
        onOpenImage={setSelectedImageUrl}
        onDeleteAccount={() => void handleDeleteAccount()}
        accountDeleting={accountDeleting}
        accountDeletionMessage={accountDeletionMessage}
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
      <JobToasts
        toasts={toasts}
        onDismiss={dismissToast}
        onAction={handleToastAction}
      />
    </>
  );
}

// ── New model form ────────────────────────────────────────────────────────────

function NewModelPanel({
  credits,
  modelName,
  photos,
  uploadedUrls,
  photoConsentAccepted,
  uploading,
  trainingCreating,
  formMessage,
  fileInputRef,
  onModelNameChange,
  onAddFiles,
  onRemovePhoto,
  onPhotoConsentChange,
  onUpload,
  onStartTraining,
  onCancel
}: {
  credits: DashboardCredits;
  modelName: string;
  photos: SelectedPhoto[];
  uploadedUrls: string[] | null;
  photoConsentAccepted: boolean;
  uploading: boolean;
  trainingCreating: boolean;
  formMessage: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onModelNameChange: (v: string) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onRemovePhoto: (id: string) => void;
  onPhotoConsentChange: (accepted: boolean) => void;
  onUpload: () => void;
  onStartTraining: () => void;
  onCancel: () => void;
}) {
  const lacksTrainingCredits = !hasEnoughCredits(credits.gold, TRAINING_GOLD_CREDITS);
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
              disabled={uploading || lacksTrainingCredits || !photoConsentAccepted}
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

            <label className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-xs leading-relaxed text-ink-soft">
              <input
                type="checkbox"
                checked={photoConsentAccepted}
                onChange={event => onPhotoConsentChange(event.target.checked)}
                disabled={uploading || !!uploadedUrls || trainingCreating}
                className="mt-0.5 h-4 w-4 accent-navy disabled:opacity-60"
              />
              <span>
                Acepto los{" "}
                <Link href="/terms" className="font-semibold text-navy underline-offset-2 hover:underline">Términos</Link>,
                {" "}la{" "}
                <Link href="/privacy" className="font-semibold text-navy underline-offset-2 hover:underline">Política de Privacidad</Link>
                {" "}y la{" "}
                <Link href="/cookies" className="font-semibold text-navy underline-offset-2 hover:underline">Política de Cookies</Link>
                {" "}y el procesamiento de mis fotos y datos faciales para entrenar un modelo personal.
              </span>
            </label>

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
              {lacksTrainingCredits ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-red-600">
                  <span>{getInsufficientCreditsMessage({ kind: "gold", required: TRAINING_GOLD_CREDITS, available: credits.gold })}</span>
                  <Button asChild size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
                    <Link href="/pricing">Comprar creditos</Link>
                  </Button>
                </div>
              ) : photos.length >= MIN_PHOTOS ? (
                <Button
                  type="button"
                  onClick={onUpload}
                  disabled={uploading || lacksTrainingCredits || !photoConsentAccepted}
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
                disabled={trainingCreating || !modelName.trim() || lacksTrainingCredits || !photoConsentAccepted}
                variant="pill"
                size="pill"
              >
                {trainingCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                {trainingCreating ? "Starting..." : "Train model"}
              </Button>
              {formMessage ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-red-600">
                  <span>{formMessage}</span>
                  {formMessage.toLowerCase().includes("credit") ? (
                    <Button asChild size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
                      <Link href="/pricing">Comprar creditos</Link>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  Costs {TRAINING_GOLD_CREDITS} gold credit · Usually ready in 4-9 minutes.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quick edit form ───────────────────────────────────────────────────────────

function QuickEditPanel({
  credits,
  photos,
  preset,
  prompt,
  engine,
  quality,
  imageSize,
  numImages,
  legalAccepted,
  uploading,
  message,
  editJobs,
  onDeleteEdit,
  onDismissFailedJob,
  generationJobId,
  generationStatus,
  generationError,
  generationCreditsUsed,
  generationCreditKind,
  generationElapsed,
  generationCreatedAt,
  generationLastUpdatedAt,
  signedUrls,
  selectedImageUrl,
  fileInputRef,
  onPresetChange,
  onPromptChange,
  onEngineChange,
  onQualityChange,
  onImageSizeChange,
  onNumImagesChange,
  onLegalAcceptedChange,
  onAddFiles,
  onRemovePhoto,
  onGenerate,
  onReset,
  onRetryJob,
  onSelectImage,
  onCloseImage,
  onCancel
}: {
  credits: DashboardCredits;
  photos: SelectedPhoto[];
  preset: QuickEditPreset;
  prompt: string;
  engine: QuickEditEngine;
  quality: "low" | "medium" | "high";
  imageSize: QuickImageSize;
  numImages: (typeof IMAGE_COUNTS)[number];
  legalAccepted: boolean;
  uploading: boolean;
  message: string | null;
  editJobs: GenerateJob[];
  onDeleteEdit: (id: string) => void;
  onDismissFailedJob: (id: string) => void;
  generationJobId: string | null;
  generationStatus: JobStatus | null;
  generationError: string | null;
  generationCreditsUsed: number;
  generationCreditKind: "blue" | "gold";
  generationElapsed: number;
  generationCreatedAt: string | null;
  generationLastUpdatedAt: string | null;
  signedUrls: string[] | null;
  selectedImageUrl: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPresetChange: (v: QuickEditPreset) => void;
  onPromptChange: (v: string) => void;
  onEngineChange: (v: QuickEditEngine) => void;
  onQualityChange: (v: "low" | "medium" | "high") => void;
  onImageSizeChange: (v: QuickImageSize) => void;
  onNumImagesChange: (v: (typeof IMAGE_COUNTS)[number]) => void;
  onLegalAcceptedChange: (accepted: boolean) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onRemovePhoto: (id: string) => void;
  onGenerate: () => void;
  onReset: () => void;
  onRetryJob: (job: GenerateJob) => void;
  onSelectImage: (url: string) => void;
  onCloseImage: () => void;
  onCancel: () => void;
}) {
  const isGenerating = !!generationJobId && !signedUrls && generationStatus !== "failed";
  const qualityOption = QUICK_QUALITY_OPTIONS.find(option => option.value === quality) ?? QUICK_QUALITY_OPTIONS[0];
  const blueCost = getQuickEditBlueCost(quality, numImages);
  const lacksCredits = !hasEnoughCredits(credits.blue, blueCost);
  const selectedEngineLabel = QUICK_ENGINE_OPTIONS.find(option => option.value === engine)?.label ?? "Quick edit";
  const currentProgress = generationJobId
    ? getJobProgressInfo({
        type: "headshot-edit",
        status: generationStatus,
        createdAt: generationCreatedAt ?? FALLBACK_CREATED_AT,
        lastUpdatedAt: generationLastUpdatedAt
      })
    : null;
  const currentFailure = getUserFacingJobError(generationError);
  const resultAspectClass =
    imageSize === "auto" ? "h-80" :
    imageSize === "landscape_16_9" ? "aspect-video" :
    "aspect-[3/4]";

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
          <p className="font-semibold text-ink">Quick edit</p>
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
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{currentProgress?.stage ?? "Generando"} with {selectedEngineLabel}...</p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {formatElapsed(generationElapsed)} · {currentProgress?.statusText ?? "Tiempo estimado: 3m 00s"}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-2">
                  <span className="block h-full rounded-full bg-navy" style={{ width: `${currentProgress?.progress ?? 8}%` }} />
                </div>
                {currentProgress?.lastUpdatedLabel ? (
                  <p className="mt-1.5 text-xs text-ink-muted">{currentProgress.lastUpdatedLabel}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : generationStatus === "failed" ? (
          <div className="mb-8 rounded-xl border border-red-100 bg-red-50 p-6">
            <p className="font-medium text-red-800">{currentFailure.title}</p>
            <p className="mt-1 text-sm text-red-600">{currentFailure.description}</p>
            <p className="mt-2 text-sm font-semibold text-red-800">
              {getRefundCopy(generationCreditsUsed || blueCost, generationCreditKind)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onGenerate}
                className="border-red-200 text-red-700 hover:bg-red-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reintentar
              </Button>
              {currentFailure.cta === "contact" ? (
                <Button asChild variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50">
                  <Link href={`mailto:${SUPPORT_EMAIL}`}>Contactar soporte</Link>
                </Button>
              ) : null}
              {generationJobId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onDismissFailedJob(generationJobId)}
                  className="border-red-200 text-red-700 hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Ocultar
                </Button>
              ) : null}
            </div>
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
            <div className={cn("grid gap-3", imageSize === "landscape_16_9" || imageSize === "auto" ? "lg:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
              {signedUrls.map((url, i) => (
                <div key={url} className="overflow-hidden rounded-xl border border-line bg-surface">
                  <button
                    type="button"
                    onClick={() => onSelectImage(url)}
                    className={cn("relative block w-full bg-bg-2", resultAspectClass)}
                  >
                    <img
                      src={url}
                      alt={`Edited headshot ${i + 1}`}
                      className={cn("h-full w-full transition-opacity hover:opacity-90", imageSize === "auto" ? "object-contain" : "object-cover")}
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
          <div className="rounded-[18px] border border-line bg-surface px-7 py-[26px] shadow-[0_22px_48px_-38px_rgba(20,27,50,.38)]">
            <p className="mb-[22px] text-[11px] font-bold uppercase tracking-[.15em] text-ink-muted">
              Quick edit
            </p>

            <div className="mb-5">
              <p className="mb-[11px] text-[13.5px] font-semibold text-ink">Engine</p>
              <div className="grid max-w-[520px] grid-cols-2 rounded-[13px] border border-line bg-bg-2 p-1">
                {QUICK_ENGINE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (!option.disabled) onEngineChange(option.value);
                    }}
                    disabled={option.disabled}
                    title={option.disabled ? "Coming soon" : undefined}
                    className={cn(
                      "rounded-[10px] px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45",
                      engine === option.value
                        ? "bg-navy text-navy-foreground shadow-[0_14px_30px_-18px_rgba(20,27,50,.8)]"
                        : "text-ink-muted hover:text-ink"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <p className="mb-[11px] text-[13.5px] font-semibold text-ink">Preset</p>
              <div className="grid gap-[13px] sm:grid-cols-3">
                  {QUICK_PRESET_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onPresetChange(option.value)}
                      className={cn(
                        "relative flex min-h-[136px] flex-col gap-2 rounded-[13px] border-[1.5px] px-[17px] py-4 text-left transition",
                        preset === option.value
                          ? "border-navy bg-navy-tint"
                          : "border-line bg-bg hover:border-line-strong hover:bg-surface"
                      )}
                    >
                      <span className={cn(
                        "absolute right-3.5 top-3.5 flex size-[28px] items-center justify-center rounded-full transition",
                        preset === option.value ? "bg-navy text-navy-foreground" : "bg-surface text-transparent"
                      )}>
                        <Check className="size-[14px]" />
                      </span>
                      <span className="pr-9 text-[15px] font-bold text-ink">{option.label}</span>
                      <span className="text-[12.5px] leading-[1.55] text-ink-soft">{option.description}</span>
                    </button>
                  ))}
              </div>
            </div>

            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[13.5px] font-semibold text-ink">
                  Reference photos ({QUICK_MIN_PHOTOS}-{QUICK_MAX_PHOTOS})
                </label>
                <span className="text-sm text-ink-muted">{photos.length} / {QUICK_MAX_PHOTOS}</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  onAddFiles(e.dataTransfer.files);
                }}
                disabled={uploading || lacksCredits || !legalAccepted}
                className="flex min-h-28 w-full flex-col items-center justify-center rounded-[13px] border border-dashed border-line-strong bg-bg px-6 py-6 text-center transition-colors hover:border-navy hover:bg-navy-tint disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="mb-2 h-6 w-6 text-ink-muted" />
                <span className="text-sm font-medium text-ink-soft">Drag or click to select</span>
                <span className="mt-1 text-xs text-ink-muted">JPG or PNG · Originals under 4 MB are preserved</span>
              </button>
              {lacksCredits ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-red-600">
                  <span>{getInsufficientCreditsMessage({ kind: "blue", required: blueCost, available: credits.blue })}</span>
                  <Button asChild size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
                    <Link href="/pricing">Comprar creditos</Link>
                  </Button>
                </div>
              ) : null}
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-xs leading-relaxed text-ink-soft">
                <input
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={event => onLegalAcceptedChange(event.target.checked)}
                  disabled={uploading}
                  className="mt-0.5 h-4 w-4 accent-navy disabled:opacity-60"
                />
                <span>
                  Acepto los{" "}
                  <Link href="/terms" className="font-semibold text-navy underline-offset-2 hover:underline">Términos</Link>
                  {", la "}
                  <Link href="/privacy" className="font-semibold text-navy underline-offset-2 hover:underline">Política de Privacidad</Link>
                  {" y la "}
                  <Link href="/cookies" className="font-semibold text-navy underline-offset-2 hover:underline">Política de Cookies</Link>
                  {" "}antes de subir fotos de referencia.
                </span>
              </label>
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
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {photos.map(photo => (
                    <div key={photo.id} className="relative aspect-square overflow-hidden rounded-[10px] border border-line bg-bg-2">
                      <Image src={photo.previewUrl} alt="" fill unoptimized className="object-cover" />
                      <button
                        type="button"
                        onClick={() => onRemovePhoto(photo.id)}
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-white"
                      >
                        <X className="h-3.5 w-3.5 text-ink-soft" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {preset === "free" ? (
              <div className="mb-5">
                <label className="mb-[11px] block text-[13.5px] font-semibold text-ink">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={e => onPromptChange(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Describe the exact edit, setting, styling, crop, clothing, background, and mood."
                  className="w-full resize-none rounded-[13px] border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
                />
              </div>
            ) : null}

            <div className="mb-6 grid gap-5 border-t border-line pt-[22px] lg:grid-cols-[1fr_1fr_1fr]">
              <div>
                <p className="mb-[11px] text-[13.5px] font-semibold text-ink">Quality</p>
                <div className="inline-flex max-w-full rounded-[11px] border border-line bg-bg-2 p-1">
                  {QUICK_QUALITY_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onQualityChange(option.value)}
                      className={cn(
                        "rounded-[9px] px-4 py-2 text-sm font-semibold transition-all",
                        quality === option.value
                          ? "bg-navy text-navy-foreground shadow-[0_14px_30px_-18px_rgba(20,27,50,.8)]"
                          : "text-ink-muted hover:text-ink"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-[11px] flex items-center gap-1.5">
                  <p className="text-[13.5px] font-semibold text-ink">Size</p>
                  <span
                    title="Original size preserves the source aspect ratio, which usually keeps real-world edits closer to the original photo."
                    className="inline-flex text-ink-muted"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="grid max-w-full grid-cols-1 rounded-[11px] border border-line bg-bg-2 p-1">
                  {QUICK_IMAGE_SIZE_OPTIONS.map(option => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onImageSizeChange(option.value)}
                        className={cn(
                          "flex w-full items-center justify-center gap-1.5 rounded-[9px] px-3 py-2 text-center text-sm font-semibold transition-all",
                          imageSize === option.value
                            ? "bg-navy text-navy-foreground shadow-[0_14px_30px_-18px_rgba(20,27,50,.8)]"
                            : "text-ink-muted hover:text-ink"
                        )}
                        title={option.description}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-[11px] text-[13.5px] font-semibold text-ink">Count</p>
                <div className="inline-flex rounded-[11px] border border-line bg-bg-2 p-1">
                  {IMAGE_COUNTS.map(count => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onNumImagesChange(count)}
                      className={cn(
                        "rounded-[9px] px-4 py-2 text-sm font-semibold transition-all",
                        numImages === count
                          ? "bg-navy text-navy-foreground shadow-[0_14px_30px_-18px_rgba(20,27,50,.8)]"
                          : "text-ink-muted hover:text-ink"
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  {blueCost} blue {blueCost === 1 ? "credit" : "credits"} · {qualityOption.label}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
	                type="button"
	                onClick={onGenerate}
		                disabled={uploading || photos.length < QUICK_MIN_PHOTOS || lacksCredits || !legalAccepted}
                variant="pill"
                size="pill"
                className="shadow-[0_18px_34px_-20px_rgba(20,27,50,.82)]"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {uploading ? (message ?? "Uploading...") : `Generate with ${engine === "gpt-image-2" ? "GPT Image 2" : "Nano Banana Pro"}`}
              </Button>
              {message &&
                (message.toLowerCase().includes("credit") ? (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <span>{message}</span>
                    <Button asChild size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
	                      <Link href="/pricing">Comprar creditos</Link>
                    </Button>
                  </div>
                ) : (
                  <p className={cn("text-sm", uploading ? "text-ink-soft" : "text-red-600")}>{message}</p>
                ))}
            </div>
          </div>
        )}

        {/* Saved quick edits */}
	        {editJobs.length > 0 && (
	          <div className="mt-8">
	            <ResultsHistory
	              jobs={editJobs}
	              kind="edit"
	              onDelete={onDeleteEdit}
	              onRetry={onRetryJob}
	              onDismissFailed={onDismissFailedJob}
	              lastUpdatedAt={generationLastUpdatedAt}
	            />
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
          <ResultsHistory jobs={modelGenerateJobs} onRetry={job => void onGenerate()} lastUpdatedAt={null} />
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

// ── Results history (per-model generates, or quick edits with delete) ──────────

const HISTORY_PAGE_SIZE = 10;

function ResultsHistory({
  jobs,
  kind = "generate",
  onDelete,
  onRetry,
  onDismissFailed,
  lastUpdatedAt
}: {
  jobs: GenerateJob[];
  kind?: "generate" | "edit";
  onDelete?: (id: string) => void;
  onRetry?: (job: GenerateJob) => void;
  onDismissFailed?: (id: string) => void;
  lastUpdatedAt?: string | null;
}) {
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { activeJobs, failedJobs, doneJobs } = splitJobsByStatus(jobs);
  if (activeJobs.length === 0 && failedJobs.length === 0 && doneJobs.length === 0) return null;

  const visibleJobs = doneJobs.slice(0, visibleCount);
  const remaining = doneJobs.length - visibleCount;

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">
        History
      </p>
      <div className="space-y-2">
        {activeJobs.map(job => (
          <RunningHistoryRow key={job.id} job={job} kind={kind} lastUpdatedAt={lastUpdatedAt} />
        ))}
        {failedJobs.map(job => (
          <FailedHistoryRow
            key={job.id}
            job={job}
            kind={kind}
            onRetry={onRetry ? () => onRetry(job) : undefined}
            onDismiss={onDismissFailed ? () => onDismissFailed(job.id) : undefined}
          />
        ))}
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

function RunningHistoryRow({
  job,
  kind = "generate",
  lastUpdatedAt
}: {
  job: GenerateJob;
  kind?: "generate" | "edit";
  lastUpdatedAt?: string | null;
}) {
  const jobStyle = (job.input as { style?: string } | null)?.style ?? "professional";
  const styleLabel = STYLE_OPTIONS.find(s => s.value === jobStyle)?.label ?? jobStyle;
  const label = kind === "edit" ? getQuickEditEngineLabel(job) : styleLabel;
  const count = (job.input as { num_images?: number } | null)?.num_images ?? 1;
  const progress = getJobProgressInfo({
    type: kind === "edit" ? "headshot-edit" : "headshot-generate",
    status: job.status,
    createdAt: job.createdAt,
    lastUpdatedAt
  });

  return (
    <div className="rounded-xl border border-sage-line bg-sage-tint px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface">
          <Loader2 className="dsh-task-spin h-4 w-4 text-sage" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {label} · {count} {count === 1 ? "photo" : "photos"}
          </p>
          <p className="text-xs text-ink-muted">
            {progress.stage} · {progress.statusText}{progress.lastUpdatedLabel ? ` · ${progress.lastUpdatedLabel}` : ""}
          </p>
          <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-surface">
            <span className="block h-full rounded-full bg-sage" style={{ width: `${progress.progress}%` }} />
          </div>
        </div>
        <span className="rounded-full border border-sage-line bg-surface px-3 py-1 text-xs font-semibold text-sage-deep">
          {progress.progress}%
        </span>
      </div>
    </div>
  );
}

function FailedHistoryRow({
  job,
  kind = "generate",
  onRetry,
  onDismiss
}: {
  job: GenerateJob;
  kind?: "generate" | "edit";
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const jobStyle = (job.input as { style?: string } | null)?.style ?? "professional";
  const styleLabel = STYLE_OPTIONS.find(s => s.value === jobStyle)?.label ?? jobStyle;
  const label = kind === "edit" ? getQuickEditEngineLabel(job) : styleLabel;
  const count = (job.input as { num_images?: number } | null)?.num_images ?? job.creditsUsed;
  const message = getUserFacingJobError(job.error);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-red-600">
          <AlertCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-red-900">
            {label} · {count} {count === 1 ? "photo" : "photos"} fallaron
          </p>
          <p className="mt-1 text-xs text-red-700">{message.description}</p>
          <p className="mt-1 text-xs font-semibold text-red-800">{getRefundCopy(job.creditsUsed, job.creditKind)}</p>
        </div>
        {onRetry || onDismiss ? (
          <div className="flex shrink-0 flex-col gap-2">
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="self-end rounded-md p-1 text-red-500 transition hover:bg-red-100 hover:text-red-700"
                aria-label="Ocultar fallo"
                title="Ocultar"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            {onRetry ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetry} className="border-red-200 text-red-700 hover:bg-red-50">
                <RefreshCw className="h-3.5 w-3.5" />
                Reintentar
              </Button>
            ) : null}
            {message.cta === "contact" ? (
              <Button asChild variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50">
                <Link href={`mailto:${SUPPORT_EMAIL}`}>Soporte</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
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
  const label = kind === "edit" ? getQuickEditEngineLabel(job) : styleLabel;
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
              if (window.confirm("Are you sure you want to delete this result? The images will be removed permanently.")) {
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
