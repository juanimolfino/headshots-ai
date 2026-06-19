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

  it("refreshes credits when training transitions from active to complete", () => {
    expect(appSource).toContain("hadActiveTrainingJobRef");
    expect(appSource).toContain("const hadActiveTrainingJob = hadActiveTrainingJobRef.current");
    expect(appSource).toContain("if (hadActiveTrainingJob && !active) {\n        void loadCredits();\n      }");
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

  it("lets users permanently delete failed jobs from history", () => {
    expect(appSource).toContain("dismissFailedJob");
    expect(appSource).toContain('fetch(`/api/jobs/${jobId}`, { method: "DELETE" })');
    expect(appSource).toContain("visibleFailedTrainingJobs");
    expect(appSource).toContain("visibleModelGenerateJobs");
    expect(appSource).toContain("visibleEditJobs");
    expect(dashboardSource).toContain("onDismissFailedJob");
    expect(dashboardSource).toContain("Delete");
  });

  it("requires explicit consent before uploading photos for training or quick edit", () => {
    expect(appSource).toContain("photoConsentAccepted");
    expect(appSource).toContain("quickLegalAccepted");
    expect(appSource).toContain('/api/consent');
    expect(appSource).toContain('purpose: "training-source"');
    expect(appSource).toContain('purpose: "quick-edit-reference"');
    expect(appSource).toContain("processing my photos and facial data");
  });

  it("keeps the training model name editable after upload finishes", () => {
    expect(appSource).toContain('placeholder="e.g. Alex, Jordan…"');
    expect(appSource).toContain("disabled={uploading || trainingCreating}");
  });

  it("hides account deletion behind a settings panel with double confirmation", () => {
    expect(appSource).toContain('/api/account/delete');
    expect(appSource).toContain("showSettingsPanel");
    expect(appSource).toContain("Manage billing");
    expect(appSource).toContain("View subscription plans");
    expect(appSource).toContain("Will cancel at period end");
    expect(appSource).toContain("No active subscription");
    expect(appSource).toContain("Contact support");
    expect(appSource).toContain("supportMailto()");
    expect(appSource).toContain("deleteConfirmChecked");
    expect(appSource).toContain("deleteConfirmText !== \"DELETE\"");
    expect(appSource).toContain("e.target.value.toUpperCase()");
    expect(appSource).toContain("Delete my data");
    expect(dashboardSource).toContain("Settings");
    expect(dashboardSource).toContain("onOpenSettings");
    expect(dashboardSource).not.toContain("Delete my data");
  });

  it("reuses quick edit reference URLs and can clear the session cache", () => {
    expect(appSource).toContain("cachedUrl");
    expect(appSource).toContain("cachedUrlExpiresAt");
    expect(appSource).toContain("isReusableUrl(photo)");
    expect(appSource).toContain("uploadQuickReferencePhoto");
    expect(appSource).toContain("FAL_REFERENCE_URL_TTL_MS");
    expect(appSource).toContain("setQuickPhotos([])");
    expect(appSource).toContain("setQuickPrompt(defaultQuickPrompt())");
    expect(appSource).toContain("onClear={clearQuickEditSession}");
    expect(appSource).toContain("Clear");
  });

  it("lets users re-edit a signed result through quick edit and keeps normal credit charging", () => {
    expect(appSource).toContain("useResultAsQuickEditBase");
    expect(appSource).toContain("sourceJobId");
    expect(appSource).toContain("sourceIndex");
    expect(appSource).toContain("refreshSignedResultUrl");
    expect(appSource).toContain("SIGNED_RESULT_URL_TTL_MS");
    expect(appSource).toContain('type: "headshot-edit"');
    expect(appSource).toContain("const quickCost = getQuickEditBlueCost(quickQuality, quickNumImages)");
    expect(appSource).toContain("onEditResult={useResultAsQuickEditBase}");
    expect(dashboardSource).toContain("Edit this result");
  });
});
