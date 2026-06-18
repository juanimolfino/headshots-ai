import { describe, expect, it, vi } from "vitest";
import type { JobStatus, JobType } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(() => ({})),
  logWarn: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb
}));

vi.mock("@/lib/observability/logger", () => ({
  logWarn: mocks.logWarn
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn()
}));

import {
  cleanupExpiredJobs,
  FAILED_JOB_RETENTION_DAYS,
  GALLERY_JOB_RETENTION_DAYS,
  getRetentionJobStoragePaths
} from "@/lib/db/queries";

type TestJob = {
  id: string;
  type: JobType;
  status: JobStatus;
  createdAt: Date;
  resultUrl: string | null;
  result: unknown;
};

function job(input: Partial<TestJob> & Pick<TestJob, "id" | "type" | "status" | "createdAt">): TestJob {
  return {
    resultUrl: null,
    result: null,
    ...input
  };
}

describe("job retention cleanup", () => {
  it("deletes old failed jobs and old gallery jobs, but never touches training jobs or transactions", async () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const dbJobs = [
      job({ id: "failed_old", type: "headshot-generate", status: "failed", createdAt: new Date("2026-02-01T00:00:00.000Z") }),
      job({ id: "failed_recent", type: "headshot-generate", status: "failed", createdAt: new Date("2026-05-01T00:00:00.000Z") }),
      job({ id: "done_old_generate", type: "headshot-generate", status: "done", createdAt: new Date("2025-12-01T00:00:00.000Z"), resultUrl: "headshots/user/job/0.jpg" }),
      job({ id: "done_old_edit", type: "headshot-edit", status: "done", createdAt: new Date("2025-12-02T00:00:00.000Z"), result: ["headshots/user/job/1.jpg"] }),
      job({ id: "done_recent", type: "headshot-edit", status: "done", createdAt: new Date("2026-04-01T00:00:00.000Z"), resultUrl: "headshots/user/recent/0.jpg" }),
      job({ id: "training_old", type: "headshot-training", status: "done", createdAt: new Date("2025-01-01T00:00:00.000Z"), resultUrl: "r2:loras/user/job/model.safetensors" })
    ];
    const transactions = [{ id: "txn_1" }];
    const deletedStorage: string[] = [];

    const loadFailedJobs = async (cutoff: Date) =>
      dbJobs.filter(item => item.status === "failed" && item.createdAt < cutoff);
    const loadDoneGalleryJobs = async (cutoff: Date) =>
      dbJobs.filter(item =>
        item.status === "done" &&
        ["headshot-generate", "headshot-edit", "tts"].includes(item.type) &&
        item.createdAt < cutoff
      );
    const deleteJobs = async (jobIds: string[]) => {
      for (const id of jobIds) {
        const index = dbJobs.findIndex(item => item.id === id);
        if (index >= 0) dbJobs.splice(index, 1);
      }
    };

    const firstRun = await cleanupExpiredJobs({
      now,
      loadFailedJobs,
      loadDoneGalleryJobs,
      deleteJobs,
      deleteStorageForJob: async (retentionJob) => {
        deletedStorage.push(retentionJob.id);
        return { deleted: 1 };
      }
    });
    const secondRun = await cleanupExpiredJobs({
      now,
      loadFailedJobs,
      loadDoneGalleryJobs,
      deleteJobs,
      deleteStorageForJob: async (retentionJob) => {
        deletedStorage.push(retentionJob.id);
        return { deleted: 1 };
      }
    });

    expect(firstRun).toMatchObject({
      deletedFailedJobs: 1,
      deletedDoneJobs: 2,
      skippedDoneJobs: 0,
      storageFailures: 0,
      thresholds: {
        failedDays: FAILED_JOB_RETENTION_DAYS,
        galleryDays: GALLERY_JOB_RETENTION_DAYS
      }
    });
    expect(secondRun).toMatchObject({ deletedFailedJobs: 0, deletedDoneJobs: 0 });
    expect(dbJobs.map(item => item.id).sort()).toEqual(["done_recent", "failed_recent", "training_old"]);
    expect(transactions).toEqual([{ id: "txn_1" }]);
    expect(deletedStorage).toEqual(["done_old_generate", "done_old_edit"]);
  });

  it("keeps a done job when storage deletion fails so the next run can retry", async () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const dbJobs = [
      job({ id: "done_old_generate", type: "headshot-generate", status: "done", createdAt: new Date("2025-12-01T00:00:00.000Z"), resultUrl: "headshots/user/job/0.jpg" })
    ];
    const deleteJobs = vi.fn(async (jobIds: string[]) => {
      for (const id of jobIds) {
        const index = dbJobs.findIndex(item => item.id === id);
        if (index >= 0) dbJobs.splice(index, 1);
      }
    });

    const result = await cleanupExpiredJobs({
      now,
      loadFailedJobs: async () => [],
      loadDoneGalleryJobs: async () => dbJobs,
      deleteJobs,
      deleteStorageForJob: async () => {
        throw new Error("storage unavailable");
      }
    });

    expect(result).toMatchObject({
      deletedDoneJobs: 0,
      skippedDoneJobs: 1,
      storageFailures: 1
    });
    expect(dbJobs.map(item => item.id)).toEqual(["done_old_generate"]);
    expect(deleteJobs).toHaveBeenCalledWith([]);
    expect(mocks.logWarn).toHaveBeenCalledWith("job_retention_storage_delete_failed", expect.objectContaining({
      area: "db.retention",
      jobId: "done_old_generate",
      message: "storage unavailable"
    }));
  });

  it("extracts Supabase storage paths from resultUrl and nested result payloads", () => {
    expect(getRetentionJobStoragePaths({
      resultUrl: "https://example.supabase.co/storage/v1/object/sign/ai-results/headshots/user/job/0.jpg?token=abc",
      result: {
        output: [
          "headshots/user/job/1.jpg",
          "https://example.supabase.co/storage/v1/object/public/ai-results/headshots/user/job/2.jpg"
        ]
      }
    }, "ai-results")).toEqual([
      "headshots/user/job/0.jpg",
      "headshots/user/job/1.jpg",
      "headshots/user/job/2.jpg"
    ]);
  });
});
