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
      title: "We could not process this job",
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
    expect(getRefundCopy(1, "blue")).toBe("We refunded 1 blue credit.");
    expect(getRefundCopy(3, "blue")).toBe("We refunded 3 blue credits.");
    expect(getRefundCopy(1, "gold")).toBe("We refunded 1 golden credit.");
    expect(getRefundCopy(2, "gold")).toBe("We refunded 2 golden credits.");
  });

  it("checks credit preconditions and returns type-specific copy", () => {
    expect(hasEnoughCredits(2, 2)).toBe(true);
    expect(hasEnoughCredits(1, 2)).toBe(false);
    expect(getInsufficientCreditsMessage({ kind: "gold", required: 1, available: 0 })).toBe(
      "You need 1 golden credit and you have 0."
    );
    expect(getInsufficientCreditsMessage({ kind: "blue", required: 4, available: 1 })).toBe(
      "You need 4 blue credits and you have 1."
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
      stage: "Training",
      progress: 95,
      isOverEta: true,
      statusText: "Taking longer than usual. You can keep waiting.",
      lastUpdatedLabel: "Last updated: just now"
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
