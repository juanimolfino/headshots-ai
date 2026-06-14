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
  if (finalizing) return "Finalizando";
  if (status === "failed") return "Falló";
  if (status === "done") return "Listo";
  if (status === "pending") return "En cola";
  if (type === "headshot-training" || type === "training") return "Entrenando";
  if (type === "headshot-edit" || type === "edit") return "Editando";
  return "Generando";
}

export function formatLastUpdated(lastUpdatedAt: string | Date | null | undefined, now: Date = new Date()) {
  if (!lastUpdatedAt) return null;
  const elapsed = getElapsedSeconds(lastUpdatedAt, now);
  if (elapsed < 5) return "Ultima actualizacion: recien";
  if (elapsed < 60) return `Ultima actualizacion: hace ${elapsed}s`;
  const minutes = Math.floor(elapsed / 60);
  return `Ultima actualizacion: hace ${minutes}m`;
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
      ? "Tardando mas de lo normal, segui esperando."
      : `Tiempo estimado: ${formatDuration(etaSeconds)}`
  };
}

export function getRefundCopy(credits: number | null | undefined, kind: CreditKind | null | undefined) {
  const amount = Math.max(0, Math.trunc(credits ?? 0));
  const safeAmount = amount || 1;
  if (kind === "gold") {
    return `Te devolvimos ${safeAmount} ${safeAmount === 1 ? "credito dorado" : "creditos dorados"}.`;
  }
  return `Te devolvimos ${safeAmount} ${safeAmount === 1 ? "credito azul" : "creditos azules"}.`;
}

export function hasEnoughCredits(available: number, cost: number) {
  return Math.max(0, available) >= Math.max(0, cost);
}

export function getInsufficientCreditsMessage(input: {
  kind: CreditKind;
  required: number;
  available: number;
}) {
  const label = input.kind === "gold" ? "dorados" : "azules";
  const singular = input.kind === "gold" ? "dorado" : "azul";
  const required = Math.max(1, Math.trunc(input.required));
  const available = Math.max(0, Math.trunc(input.available));
  return `Necesitas ${required} ${required === 1 ? `credito ${singular}` : `creditos ${label}`} y tenes ${available}.`;
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
      title: "No hay creditos suficientes",
      description: "Necesitas comprar creditos para iniciar este trabajo.",
      cta: "buy"
    };
  }

  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("tardo mas")) {
    return {
      category: "timeout",
      title: "El trabajo tardo mas de lo esperado",
      description: "Lo detuvimos de forma segura. Podes reintentarlo cuando quieras.",
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
      title: "No pudimos usar una de las fotos",
      description: "Revisa que las imagenes sean claras, validas y aptas para procesar. Despues reintentalo.",
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
      title: "No pudimos procesar este trabajo",
      description: "El proveedor de IA fallo o no devolvio una imagen valida. Reintenta en unos minutos.",
      cta: "retry"
    };
  }

  return {
    category: "generic",
    title: "No pudimos completar este trabajo",
    description: normalized || "Reintentalo. Si vuelve a pasar, contacta soporte.",
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
