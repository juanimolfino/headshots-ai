import { describe, expect, it } from "vitest";
import { collectNewJobToastEvents, getJobToastEvents, markJobToastEventsSeen } from "@/lib/job-toast-events";

describe("job toast events", () => {
  it("creates success notifications by job type", () => {
    const trainingEvent = getJobToastEvents({
      id: "train_1",
      type: "headshot-training",
      status: "done"
    })[0];
    expect(trainingEvent).toMatchObject({
      kind: "success",
      title: "Tu modelo esta listo"
    });
    expect(trainingEvent).not.toHaveProperty("actionLabel");

    const generateEvent = getJobToastEvents({
      id: "generate_1",
      type: "headshot-generate",
      status: "done"
    })[0];
    expect(generateEvent).toMatchObject({
      kind: "success",
      title: "Tus fotos estan listas"
    });
    expect(generateEvent).not.toHaveProperty("actionLabel");

    const editEvent = getJobToastEvents({
      id: "edit_1",
      type: "headshot-edit",
      status: "done"
    })[0];
    expect(editEvent).toMatchObject({
      kind: "success",
      title: "Tu edicion esta lista"
    });
    expect(editEvent).not.toHaveProperty("actionLabel");
  });

  it("creates failure and refund notifications from the shared human error mapper", () => {
    const events = getJobToastEvents({
      id: "job_1",
      type: "headshot-edit",
      status: "failed",
      error: 'fal.ai GPT Image 2 Edit did not return any image URLs | {"stack":"raw"}',
      creditsUsed: 2,
      creditKind: "blue"
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      key: "job_1:failure",
      kind: "failure",
      title: "No pudimos procesar este trabajo"
    });
    expect(events[0].description).not.toContain("{");
    expect(events[1]).toMatchObject({
      key: "job_1:refund",
      kind: "refund",
      title: "Credito reembolsado",
      description: "Te devolvimos 2 creditos azules."
    });
  });

  it("dedupes notifications by job id and event kind", () => {
    const seen = new Set<string>();
    const jobs = [{
      id: "job_1",
      type: "headshot-generate" as const,
      status: "failed" as const,
      creditsUsed: 4,
      creditKind: "blue" as const
    }];

    const first = collectNewJobToastEvents(jobs, seen);
    const second = collectNewJobToastEvents(jobs, seen);

    expect(first.map(event => event.key)).toEqual(["job_1:failure", "job_1:refund"]);
    expect(second).toEqual([]);
  });

  it("can prime existing completed jobs without showing stale toasts", () => {
    const seen = new Set<string>();
    const oldDoneJob = [{
      id: "job_old",
      type: "headshot-training" as const,
      status: "done" as const
    }];

    markJobToastEventsSeen(oldDoneJob, seen);

    expect(collectNewJobToastEvents(oldDoneJob, seen)).toEqual([]);
    expect(collectNewJobToastEvents([{
      id: "job_new",
      type: "headshot-training",
      status: "done"
    }], seen)).toHaveLength(1);
  });
});
