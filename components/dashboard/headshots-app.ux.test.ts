import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("headshots dashboard UX safeguards", () => {
  const appSource = readFileSync(join(process.cwd(), "components/dashboard/headshots-app.tsx"), "utf8");
  const dashboardSource = readFileSync(join(process.cwd(), "components/dashboard/dashboard-ui.tsx"), "utf8");
  const jobsRouteSource = readFileSync(join(process.cwd(), "app/api/jobs/route.ts"), "utf8");

  it("keeps failed training and generation jobs visible", () => {
    expect(appSource).toContain("failedTrainingJobs");
    expect(dashboardSource).toContain('"training-failed"');
    expect(dashboardSource).toContain("TrainingFailedState");
    expect(dashboardSource).toContain("FailedGenerationRow");
    expect(appSource).toContain("FailedHistoryRow");
    expect(appSource).toContain("splitJobsByStatus(jobs)");
    expect(dashboardSource).toContain("splitJobsByStatus(jobs)");
  });

  it("exposes refund metadata needed by the failed-state UI", () => {
    expect(jobsRouteSource).toContain("creditsUsed: job.creditsUsed");
    expect(jobsRouteSource).toContain("creditKind: job.creditKind");
    expect(appSource).toContain("getRefundCopy(generationCreditsUsed || blueCost, generationCreditKind)");
    expect(dashboardSource).toContain("getRefundCopy(job.creditsUsed, job.creditKind)");
  });

  it("refreshes credits once a job reaches failed status", () => {
    expect(appSource).toContain("refreshCreditsForNewFailures");
    expect(appSource).toContain('data.status === "failed"');
    expect(appSource).toContain("void loadCredits()");
  });

  it("prechecks gold and blue credits before uploads or job creation", () => {
    expect(appSource).toContain("lacksTrainingCredits");
    expect(appSource).toContain("disabled={uploading || lacksTrainingCredits || !photoConsentAccepted}");
    expect(appSource).toContain("const quickCost = getQuickEditBlueCost(quickQuality, quickNumImages)");
    expect(appSource).toContain("disabled={uploading || photos.length < QUICK_MIN_PHOTOS || lacksCredits || !legalAccepted}");
    expect(appSource).toContain("getInsufficientCreditsMessage({ kind: \"gold\"");
    expect(appSource).toContain("getInsufficientCreditsMessage({ kind: \"blue\"");
  });

  it("emits idempotent job toasts from polling state changes", () => {
    expect(appSource).toContain("collectNewJobToastEvents");
    expect(appSource).toContain("markJobToastEventsSeen");
    expect(appSource).toContain("primedToastGroupsRef");
    expect(appSource).toContain("<JobToasts");
    expect(appSource).toContain('data.status === "done" || data.status === "failed"');
  });

  it("lets users hide persistent failed jobs from the visible history", () => {
    expect(appSource).toContain("dismissedFailedJobIds");
    expect(appSource).toContain("dismissFailedJob");
    expect(appSource).toContain("window.localStorage.setItem(dismissedFailedStorageKey");
    expect(appSource).toContain("visibleFailedTrainingJobs");
    expect(appSource).toContain("visibleModelGenerateJobs");
    expect(appSource).toContain("visibleEditJobs");
    expect(dashboardSource).toContain("onDismissFailedJob");
    expect(dashboardSource).toContain("Ocultar");
  });

  it("requires explicit consent before uploading photos for training or quick edit", () => {
    expect(appSource).toContain("photoConsentAccepted");
    expect(appSource).toContain("quickLegalAccepted");
    expect(appSource).toContain('/api/consent');
    expect(appSource).toContain('purpose: "training-source"');
    expect(appSource).toContain('purpose: "quick-edit-reference"');
    expect(appSource).toContain("procesamiento de mis fotos y datos faciales");
  });

  it("keeps the training model name editable after upload finishes", () => {
    expect(appSource).toContain('placeholder="e.g. Alex, Jordan…"');
    expect(appSource).toContain("disabled={uploading || trainingCreating}");
  });

  it("exposes irreversible account deletion from the dashboard", () => {
    expect(appSource).toContain('/api/account/delete');
    expect(appSource).toContain('confirm: "DELETE"');
    expect(dashboardSource).toContain("Delete my data");
    expect(dashboardSource).toContain("accountDeletionMessage");
  });
});
