export type JobUxStatus = "pending" | "processing" | "done" | "failed";
export type JobUxType = "headshot-training" | "headshot-generate" | "headshot-edit" | "image" | "tts";
export type CreditKind = "blue" | "gold";

export type JobUxErrorCategory = "provider" | "timeout" | "invalid_image" | "insufficient_credits" | "generic";
export type JobUxCta = "retry" | "buy" | "contact";

export type JobUserMessage = {
  category: JobUxErrorCategory;
  title: string;
  description: string;
  cta: JobUxCta;
};

export type JobProgressInfo = {
  stage: string;
  progress: number;
  elapsedLabel: string;
  etaLabel: string;
  lastUpdatedLabel: string | null;
  isOverEta: boolean;
  statusText: string;
};

export const JOB_ETA_SECONDS: Record<"training" | "generate" | "edit", number> = {
  training: 9 * 60,
  generate: 2 * 60,
  edit: 3 * 60
};

export function getJobEtaSeconds(type: JobUxType | "training" | "generate" | "edit") {
  if (type === "headshot-training" || type === "training") return JOB_ETA_SECONDS.training;
  if (type === "headshot-edit" || type === "edit") return JOB_ETA_SECONDS.edit;
  return JOB_ETA_SECONDS.generate;
}

export function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

export function getElapsedSeconds(createdAt: string | Date, now: Date = new Date()) {
  const started = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
}

export function getTimedProgress(input: {
  status: JobUxStatus | null;
  createdAt: string | Date;
  etaSeconds: number;
  now?: Date;
}) {
  if (input.status === "done") return 100;
  if (input.status === "failed") return 100;

  const elapsed = getElapsedSeconds(input.createdAt, input.now ?? new Date());
  const eta = Math.max(1, input.etaSeconds);
  if (elapsed >= eta) return 95;
  return Math.min(95, Math.max(8, Math.round((elapsed / eta) * 90)));
}

export function getJobStage(type: JobUxType | "training" | "generate" | "edit", status: JobUxStatus | null, finalizing = false) {
  if (finalizing) return "Finalizing";
  if (status === "failed") return "Failed";
  if (status === "done") return "Ready";
  if (status === "pending") return "Queued";
  if (type === "headshot-training" || type === "training") return "Training";
  if (type === "headshot-edit" || type === "edit") return "Editing";
  return "Generating";
}

export function formatLastUpdated(lastUpdatedAt: string | Date | null | undefined, now: Date = new Date()) {
  if (!lastUpdatedAt) return null;
  const elapsed = getElapsedSeconds(lastUpdatedAt, now);
  if (elapsed < 5) return "Last updated: just now";
  if (elapsed < 60) return `Last updated: ${elapsed}s ago`;
  const minutes = Math.floor(elapsed / 60);
  return `Last updated: ${minutes}m ago`;
}

export function getJobProgressInfo(input: {
  type: JobUxType | "training" | "generate" | "edit";
  status: JobUxStatus | null;
  createdAt: string | Date;
  lastUpdatedAt?: string | Date | null;
  finalizing?: boolean;
  now?: Date;
}): JobProgressInfo {
  const now = input.now ?? new Date();
  const etaSeconds = getJobEtaSeconds(input.type);
  const elapsedSeconds = getElapsedSeconds(input.createdAt, now);
  const isOverEta = input.status !== "done" && input.status !== "failed" && elapsedSeconds > etaSeconds;
  return {
    stage: getJobStage(input.type, input.status, input.finalizing),
    progress: getTimedProgress({ status: input.status, createdAt: input.createdAt, etaSeconds, now }),
    elapsedLabel: formatDuration(elapsedSeconds),
    etaLabel: formatDuration(etaSeconds),
    lastUpdatedLabel: formatLastUpdated(input.lastUpdatedAt, now),
    isOverEta,
    statusText: isOverEta
      ? "Taking longer than usual. You can keep waiting."
      : `Estimated time: ${formatDuration(etaSeconds)}`
  };
}

export function getRefundCopy(credits: number | null | undefined, kind: CreditKind | null | undefined) {
  const amount = Math.max(0, Math.trunc(credits ?? 0));
  const safeAmount = amount || 1;
  if (kind === "gold") {
    return `We refunded ${safeAmount} golden ${safeAmount === 1 ? "credit" : "credits"}.`;
  }
  return `We refunded ${safeAmount} blue ${safeAmount === 1 ? "credit" : "credits"}.`;
}

export function hasEnoughCredits(available: number, cost: number) {
  return Math.max(0, available) >= Math.max(0, cost);
}

export function getInsufficientCreditsMessage(input: {
  kind: CreditKind;
  required: number;
  available: number;
}) {
  const label = input.kind === "gold" ? "golden" : "blue";
  const required = Math.max(1, Math.trunc(input.required));
  const available = Math.max(0, Math.trunc(input.available));
  return `You need ${required} ${label} ${required === 1 ? "credit" : "credits"} and you have ${available}.`;
}

function normalizeErrorText(error: string | null | undefined) {
  if (!error) return "";
  return error
    .replace(/\s+\|\s+\{[\s\S]*$/, "")
    .replace(/^\{[\s\S]*\}$/, "")
    .trim();
}

export function getUserFacingJobError(error: string | null | undefined): JobUserMessage {
  const normalized = normalizeErrorText(error);
  const lower = (error ?? "").toLowerCase();

  if (lower.includes("insufficient_credits") || lower.includes("not enough credit") || lower.includes("saldo insuficiente")) {
    return {
      category: "insufficient_credits",
      title: "Not enough credits",
      description: "You need to buy credits before starting this job.",
      cta: "buy"
    };
  }

  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("tardo mas")) {
    return {
      category: "timeout",
      title: "This job took longer than expected",
      description: "We stopped it safely. You can try again whenever you want.",
      cta: "retry"
    };
  }

  if (
    lower.includes("invalid image") ||
    lower.includes("unsupported image") ||
    lower.includes("could not load") ||
    lower.includes("not publicly accessible") ||
    lower.includes("safety") ||
    lower.includes("policy") ||
    lower.includes("content filter")
  ) {
    return {
      category: "invalid_image",
      title: "We could not use one of the photos",
      description: "Make sure the images are clear, valid, and suitable for processing. Then try again.",
      cta: "retry"
    };
  }

  if (
    lower.includes("fal.ai") ||
    lower.includes("openai") ||
    lower.includes("gemini") ||
    lower.includes("provider") ||
    lower.includes("did not return") ||
    lower.includes("api")
  ) {
    return {
      category: "provider",
      title: "We could not process this job",
      description: "The AI provider failed or did not return a valid image. Try again in a few minutes.",
      cta: "retry"
    };
  }

  return {
    category: "generic",
    title: "We could not complete this job",
    description: normalized || "Try again. If it keeps happening, contact support.",
    cta: "contact"
  };
}

export function splitJobsByStatus<T extends { status: JobUxStatus }>(jobs: T[]) {
  return {
    activeJobs: jobs.filter(job => job.status === "pending" || job.status === "processing"),
    failedJobs: jobs.filter(job => job.status === "failed"),
    doneJobs: jobs.filter(job => job.status === "done")
  };
}
