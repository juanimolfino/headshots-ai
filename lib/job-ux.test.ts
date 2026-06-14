import { describe, expect, it } from "vitest";
import {
  getInsufficientCreditsMessage,
  getJobProgressInfo,
  getRefundCopy,
  getTimedProgress,
  getUserFacingJobError,
  hasEnoughCredits,
  splitJobsByStatus
} from "@/lib/job-ux";

describe("job UX helpers", () => {
  it("maps technical provider and JSON-appended errors to user-facing copy", () => {
    const message = getUserFacingJobError('fal.ai GPT Image 2 Edit did not return any image URLs | {"name":"Error","stack":"secret"}');

    expect(message).toMatchObject({
      category: "provider",
      title: "No pudimos procesar este trabajo",
      cta: "retry"
    });
    expect(message.description).not.toContain("{");
    expect(message.description).not.toContain("stack");
  });

  it("maps timeout, invalid image, and insufficient credit errors to distinct actions", () => {
    expect(getUserFacingJobError("headshot-edit Fal call timed out after 10 minutes")).toMatchObject({
      category: "timeout",
      cta: "retry"
    });
    expect(getUserFacingJobError("Training ZIP not publicly accessible: 403")).toMatchObject({
      category: "invalid_image",
      cta: "retry"
    });
    expect(getUserFacingJobError("INSUFFICIENT_CREDITS")).toMatchObject({
      category: "insufficient_credits",
      cta: "buy"
    });
  });

  it("formats explicit refund copy by credit kind", () => {
    expect(getRefundCopy(1, "blue")).toBe("Te devolvimos 1 credito azul.");
    expect(getRefundCopy(3, "blue")).toBe("Te devolvimos 3 creditos azules.");
    expect(getRefundCopy(1, "gold")).toBe("Te devolvimos 1 credito dorado.");
    expect(getRefundCopy(2, "gold")).toBe("Te devolvimos 2 creditos dorados.");
  });

  it("checks credit preconditions and returns type-specific copy", () => {
    expect(hasEnoughCredits(2, 2)).toBe(true);
    expect(hasEnoughCredits(1, 2)).toBe(false);
    expect(getInsufficientCreditsMessage({ kind: "gold", required: 1, available: 0 })).toBe(
      "Necesitas 1 credito dorado y tenes 0."
    );
    expect(getInsufficientCreditsMessage({ kind: "blue", required: 4, available: 1 })).toBe(
      "Necesitas 4 creditos azules y tenes 1."
    );
  });

  it("uses elapsed time against the ETA and calls out over-ETA jobs", () => {
    const now = new Date("2026-06-14T12:10:00.000Z");
    const createdAt = new Date("2026-06-14T12:00:00.000Z");

    expect(getTimedProgress({ status: "processing", createdAt, etaSeconds: 9 * 60, now })).toBe(95);
    expect(getJobProgressInfo({
      type: "headshot-training",
      status: "processing",
      createdAt,
      lastUpdatedAt: new Date("2026-06-14T12:09:56.000Z"),
      now
    })).toMatchObject({
      stage: "Entrenando",
      progress: 95,
      isOverEta: true,
      statusText: "Tardando mas de lo normal, segui esperando.",
      lastUpdatedLabel: "Ultima actualizacion: recien"
    });
  });

  it("keeps failed jobs in the visible job groups", () => {
    const jobs = [
      { id: "pending", status: "pending" as const },
      { id: "failed", status: "failed" as const },
      { id: "done", status: "done" as const }
    ];

    expect(splitJobsByStatus(jobs)).toEqual({
      activeJobs: [jobs[0]],
      failedJobs: [jobs[1]],
      doneJobs: [jobs[2]]
    });
  });
});
