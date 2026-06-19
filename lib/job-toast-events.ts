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
  if (type === "headshot-training") return "Your model is ready";
  if (type === "headshot-edit") return "Your edit is ready";
  return "Your photos are ready";
}

function successDescription(type: JobUxType) {
  if (type === "headshot-training") return "You can now generate headshots with your personal model.";
  if (type === "headshot-edit") return "Your edit is finished and available in your history.";
  return "Your headshots are finished and available in your history.";
}

export function getJobToastEvents(job: ToastJob): JobToastEvent[] {
  if (job.status === "done") {
    return [{
      key: `${job.id}:success`,
      kind: "success",
      jobId: job.id,
      jobType: job.type,
      title: successTitle(job.type),
      description: successDescription(job.type)
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
        actionLabel: "View details"
      },
      {
        key: `${job.id}:refund`,
        kind: "refund",
        jobId: job.id,
        jobType: job.type,
        title: "Credit refunded",
        description: getRefundCopy(job.creditsUsed, job.creditKind),
        actionLabel: "View details"
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
