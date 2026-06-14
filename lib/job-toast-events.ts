import { getRefundCopy, getUserFacingJobError, type CreditKind, type JobUxStatus, type JobUxType } from "@/lib/job-ux";

export type ToastJob = {
  id: string;
  type: JobUxType;
  status: JobUxStatus;
  error?: string | null;
  creditsUsed?: number | null;
  creditKind?: CreditKind | null;
};

export type JobToastKind = "success" | "failure" | "refund";

export type JobToastEvent = {
  key: string;
  kind: JobToastKind;
  jobId: string;
  jobType: JobUxType;
  title: string;
  description: string;
  actionLabel?: string;
};

function successTitle(type: JobUxType) {
  if (type === "headshot-training") return "Tu modelo esta listo";
  if (type === "headshot-edit") return "Tu edicion esta lista";
  return "Tus fotos estan listas";
}

function successDescription(type: JobUxType) {
  if (type === "headshot-training") return "Ya podes generar headshots con tu modelo personal.";
  if (type === "headshot-edit") return "Tu edicion termino y ya esta disponible en el historial.";
  return "Tus headshots terminaron y ya estan disponibles en el historial.";
}

function successActionLabel(type: JobUxType) {
  if (type === "headshot-training") return "Ver modelo";
  return "Ver resultado";
}

export function getJobToastEvents(job: ToastJob): JobToastEvent[] {
  if (job.status === "done") {
    return [{
      key: `${job.id}:success`,
      kind: "success",
      jobId: job.id,
      jobType: job.type,
      title: successTitle(job.type),
      description: successDescription(job.type),
      actionLabel: successActionLabel(job.type)
    }];
  }

  if (job.status === "failed") {
    const failure = getUserFacingJobError(job.error);
    return [
      {
        key: `${job.id}:failure`,
        kind: "failure",
        jobId: job.id,
        jobType: job.type,
        title: failure.title,
        description: failure.description,
        actionLabel: "Ver detalle"
      },
      {
        key: `${job.id}:refund`,
        kind: "refund",
        jobId: job.id,
        jobType: job.type,
        title: "Credito reembolsado",
        description: getRefundCopy(job.creditsUsed, job.creditKind),
        actionLabel: "Ver detalle"
      }
    ];
  }

  return [];
}

export function markJobToastEventsSeen(jobs: ToastJob[], seenKeys: Set<string>) {
  for (const job of jobs) {
    for (const event of getJobToastEvents(job)) {
      seenKeys.add(event.key);
    }
  }
}

export function collectNewJobToastEvents(jobs: ToastJob[], seenKeys: Set<string>) {
  const events: JobToastEvent[] = [];
  for (const job of jobs) {
    for (const event of getJobToastEvents(job)) {
      if (seenKeys.has(event.key)) continue;
      seenKeys.add(event.key);
      events.push(event);
    }
  }
  return events;
}
