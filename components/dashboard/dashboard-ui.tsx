"use client";

/* eslint-disable @next/next/no-img-element */

import type React from "react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ImageIcon,
  Images,
  Loader2,
  LogOut,
  Plus,
  Sparkles,
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StyleValue = "professional" | "cinematic" | "natural";
export type CountValue = 1 | 2 | 4;
export type BackgroundValue = "white" | "gray" | "dark" | "outdoor" | null;
export type AttireValue = "suit" | "dress" | "business_casual" | "casual" | null;
export type JobStatus = "pending" | "processing" | "done" | "failed";

export type TrainingJobLike = {
  id: string;
  status: JobStatus;
  input: Record<string, unknown> | null;
  result: { lora_url?: string; trigger_word?: string } | null;
  createdAt: string;
};

export type GenerateJobLike = {
  id: string;
  status: JobStatus;
  input: Record<string, unknown> | null;
  result: string[] | null;
  createdAt: string;
  completedAt: string | null;
};

export type ActiveGenerationJob = {
  id: string;
  status: JobStatus | null;
  progress: number;
  style: StyleValue;
  title?: string;
  count: CountValue;
  background: BackgroundValue;
  elapsed: number;
  createdAt: string;
};

export type DashboardMode = "model" | "new-model" | "quick-edit" | "loading" | "training-only" | "empty";

export type DashboardWorkspaceProps = {
  mode: DashboardMode;
  userEmail: string;
  credits: {
    blue: number;
    gold: number;
    subscriptionBlue?: number;
    subscriptionGold?: number;
    packBlue?: number;
    packGold?: number;
    subscriptionCurrentPeriodEnd?: Date | string | null;
    subscriptionStatus?: string;
  };
  models: TrainingJobLike[];
  loadingModels: boolean;
  selectedModel: TrainingJobLike | null;
  selectedModelId: string | null;
  activeTrainingJob: TrainingJobLike | null;
  trainingElapsed: number;
  activeTaskJob: ActiveGenerationJob | null;
  activeGenerationJob: ActiveGenerationJob | null;
  style: StyleValue;
  count: CountValue;
  background: BackgroundValue;
  attire: AttireValue;
  generationMessage: string | null;
  jobs: GenerateJobLike[];
  newModelContent?: React.ReactNode;
  quickEditContent?: React.ReactNode;
  onSelectModel: (id: string) => void;
  onNewModel: () => void;
  onQuickEdit: () => void;
  onStyleChange: (value: StyleValue) => void;
  onCountChange: (value: CountValue) => void;
  onBackgroundChange: (value: BackgroundValue) => void;
  onAttireChange: (value: AttireValue) => void;
  onGenerate: () => void;
  onOpenImage: (url: string) => void;
};

const STYLE_OPTIONS = [
  {
    label: "Professional",
    value: "professional",
    description: "Neutral background, studio lighting. Ideal for LinkedIn and CV."
  },
  {
    label: "Cinematic",
    value: "cinematic",
    description: "Editorial style with higher contrast. For creative profiles."
  },
  {
    label: "Natural",
    value: "natural",
    description: "No extra filters. The result closest to your real photos."
  }
] as const;

const COUNT_OPTIONS = [1, 2, 4] as const;
const BACKGROUND_OPTIONS = [
  { label: "Default", value: null },
  { label: "White", value: "white" },
  { label: "Gray", value: "gray" },
  { label: "Dark", value: "dark" },
  { label: "Outdoor", value: "outdoor" }
] as const;
const ATTIRE_OPTIONS = [
  { label: "None", value: null },
  { label: "Suit", value: "suit" },
  { label: "Dress", value: "dress" },
  { label: "Business casual", value: "business_casual" },
  { label: "Casual", value: "casual" }
] as const;

export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  // TODO: when more real routes exist under /dashboard, lift activeGenerationJob
  // into app/(dashboard)/layout.tsx via provider so TaskPill persists across pages.
  return (
    <div className="dsh">
      <DashboardSidebar {...props} />
      <main className="flex min-w-0 flex-1 flex-col bg-bg">
        <DashboardTopBar {...props} />
        <MobileActionStrip {...props} />
        <DashboardContent {...props} />
      </main>
    </div>
  );
}

function MobileActionStrip({
  mode,
  userEmail,
  models,
  loadingModels,
  selectedModelId,
  onSelectModel,
  onNewModel,
  onQuickEdit
}: DashboardWorkspaceProps) {
  return (
    <div className="hidden border-b border-line bg-navy-sidebar px-3 py-2 text-[#cfd3e0] max-[860px]:block">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {loadingModels ? (
          <span className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white/[.06] px-3 py-2 text-xs">
            <Loader2 className="dsh-ring size-3.5" />
            Loading
          </span>
        ) : (
          models.map(model => {
            const active = mode === "model" && selectedModelId === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onSelectModel(model.id)}
                className={cn(
                  "dsh-focus inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold",
                  active ? "bg-white text-navy-sidebar" : "bg-white/[.06] text-[#cfd3e0]"
                )}
              >
                <span className={cn("size-2 rounded-full", active ? "bg-ready" : "bg-[#697292]")} />
                {getModelName(model)}
              </button>
            );
          })
        )}
        <button
          type="button"
          onClick={onNewModel}
          className={cn(
            "dsh-focus inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold",
            mode === "new-model" ? "bg-white text-navy-sidebar" : "bg-white/[.06] text-[#cfd3e0]"
          )}
        >
          <Plus className="size-4" />
          New
        </button>
        <button
          type="button"
          onClick={onQuickEdit}
          className={cn(
            "dsh-focus inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold",
            mode === "quick-edit" ? "bg-white text-navy-sidebar" : "bg-white/[.06] text-[#cfd3e0]"
          )}
        >
          <Images className="size-4" />
          Quick
        </button>
        <Button asChild className="h-10 shrink-0 rounded-lg bg-white px-3 text-[13px] font-bold text-navy-sidebar hover:bg-[#eceae4]">
          <Link href="/pricing"><Wallet className="size-4" />Credits</Link>
        </Button>
        <form action="/logout" method="post" className="shrink-0">
          <button
            type="submit"
            className="dsh-focus inline-flex h-10 items-center gap-2 rounded-lg bg-white/[.06] px-3 text-[13px] font-semibold text-[#cfd3e0]"
            aria-label={`Sign out ${userEmail}`}
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </form>
      </div>
    </div>
  );
}

function DashboardContent(props: DashboardWorkspaceProps) {
  if (props.mode === "new-model") return <div className="flex flex-1 flex-col overflow-hidden">{props.newModelContent}</div>;
  if (props.mode === "quick-edit") return <div className="flex flex-1 flex-col overflow-hidden">{props.quickEditContent}</div>;
  if (props.mode === "loading") return <LoadingState />;
  if (props.mode === "training-only") return <TrainingOnlyState job={props.activeTrainingJob} elapsed={props.trainingElapsed} />;
  if (props.mode === "empty") return <EmptyModelsState onNewModel={props.onNewModel} />;

  return (
    <div className="flex w-full max-w-[1180px] flex-1 flex-col gap-6 px-[30px] py-[26px] max-[860px]:px-5">
      <GenerationCard {...props} />
      <RecentList {...props} />
    </div>
  );
}

function DashboardSidebar({
  userEmail,
  credits,
  models,
  loadingModels,
  selectedModelId,
  activeTrainingJob,
  trainingElapsed,
  onSelectModel,
  onNewModel,
  onQuickEdit
}: DashboardWorkspaceProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-[266px] shrink-0 flex-col bg-navy-sidebar px-3.5 pb-3.5 pt-5 text-[#cfd3e0] max-[860px]:hidden">
      <div className="flex items-center gap-[11px] px-2 pb-5 pt-1">
        <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-sage-side text-navy-sidebar">
          <Sparkles className="size-[18px]" />
        </span>
        <span className="text-[17px] font-bold tracking-[-0.01em] text-white">
          headshotly<span className="font-medium text-[#7e87a6]">.pro</span>
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-[3px]" aria-label="Models">
        <NavLabel>Your models</NavLabel>
        {loadingModels ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/50">
            <Loader2 className="dsh-ring size-3.5" />
            Loading
          </div>
        ) : (
          <>
            {models.map(model => (
              <ModelButton
                key={model.id}
                model={model}
                active={selectedModelId === model.id}
                onClick={() => onSelectModel(model.id)}
              />
            ))}
            {activeTrainingJob ? (
              <ModelButton
                model={activeTrainingJob}
                active={selectedModelId === activeTrainingJob.id}
                trainingElapsed={trainingElapsed}
                onClick={() => onSelectModel(activeTrainingJob.id)}
              />
            ) : null}
            <button
              type="button"
              onClick={onNewModel}
              className="dsh-focus mt-[7px] flex w-full items-center gap-2.5 rounded-xl border border-dashed border-[#2f3a5c] px-3 py-2.5 text-[13.5px] font-semibold text-[#aeb6d4] transition hover:border-sage-side hover:text-white"
            >
              <Plus className="size-4" />
              New model
            </button>
          </>
        )}
        <div className="mx-2.5 my-3.5 h-px bg-white/[.06]" />
        <NavLabel>Tools</NavLabel>
        <button
          type="button"
          onClick={onQuickEdit}
          className="dsh-focus flex w-full items-center gap-[11px] rounded-[10px] px-2.5 py-[9px] text-[13.5px] font-medium text-[#aeb6d4] transition hover:bg-white/[.045] hover:text-[#eef0f6]"
        >
          <Images className="size-[17px]" />
          Quick edit <span className="ml-auto rounded-[5px] bg-white/[.07] px-1.5 py-[3px] text-[9px] font-bold uppercase tracking-[.08em] text-[#8a92b2]">AI</span>
        </button>
        <button
          type="button"
          className="dsh-focus flex w-full items-center gap-[11px] rounded-[10px] px-2.5 py-[9px] text-[13.5px] font-medium text-[#aeb6d4] transition hover:bg-white/[.045] hover:text-[#eef0f6]"
        >
          <ImageIcon className="size-[17px]" />
          Gallery <span className="ml-auto rounded-[5px] bg-white/[.07] px-1.5 py-[3px] text-[9px] font-bold uppercase tracking-[.08em] text-[#8a92b2]">Soon</span>
        </button>
      </nav>
      <div className="flex flex-col gap-[11px]">
        <div className="rounded-[14px] border border-white/[.07] bg-white/[.04] px-[13px] py-3">
          <CreditRow tone="blue" label="Blue credits" value={credits.blue} />
          <CreditRow tone="gold" label="Golden credits" value={credits.gold} />
          <CreditBucketDetails credits={credits} />
          <Button asChild className="mt-[9px] h-auto w-full rounded-[10px] bg-white px-3 py-2.5 text-[13px] font-bold text-navy-sidebar hover:bg-[#eceae4]">
            <Link href="/pricing"><Wallet className="size-[15px]" />Buy credits</Link>
          </Button>
        </div>
        <div className="flex items-center gap-2.5 px-1.5 pb-0.5 pt-1.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-navy-sidebar">
            {userEmail.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-[#8b93ad]">{userEmail}</span>
          <form action="/logout" method="post">
            <button type="submit" className="dsh-focus rounded-lg p-1.5 text-[#8b93ad] hover:bg-white/[.07] hover:text-white" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function DashboardTopBar({ selectedModel, activeTaskJob, mode, activeTrainingJob }: DashboardWorkspaceProps) {
  const title =
    mode === "new-model" ? "New model" :
    mode === "quick-edit" ? "Quick edit" :
    selectedModel ? getModelName(selectedModel) :
    activeTrainingJob ? getModelName(activeTrainingJob) :
    "Dashboard";
  const modelReady = mode === "model" && selectedModel;

  return (
    <header className="sticky top-0 z-10 flex h-[68px] shrink-0 items-center justify-between border-b border-line bg-[color-mix(in_srgb,var(--bg)_88%,#fff)] px-[30px]">
      <div className="flex items-center gap-[13px]">
        <h1 className="m-0 text-xl font-bold tracking-[-.01em] text-ink">{title}</h1>
        {modelReady ? (
          <span className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border border-ready-line bg-ready-bg px-[11px] py-1 text-[12.5px] font-semibold text-[#3a6b4f]">
            <span className="size-[7px] rounded-full bg-ready" />
            Model ready
          </span>
        ) : null}
      </div>
      {activeTaskJob ? <TaskPill job={activeTaskJob} /> : null}
    </header>
  );
}

function TaskPill({ job }: { job: ActiveGenerationJob }) {
  return (
    <div role="status" className="flex items-center gap-2.5 rounded-full border border-line bg-surface py-[7px] pl-[13px] pr-[9px]">
      <Loader2 className="dsh-task-spin size-[15px] text-sage" />
      <span className="text-[13px] text-ink-soft"><b className="font-bold text-ink">Generating</b> · {job.count} photos</span>
      <span className="text-[12.5px] font-bold text-sage">· {job.progress}%</span>
      <ProgressBar value={job.progress} className="w-[60px]" />
    </div>
  );
}

function GenerationCard(props: DashboardWorkspaceProps) {
  const {
    selectedModel,
    activeTrainingJob,
    activeGenerationJob,
    credits,
    style,
    count,
    background,
    attire,
    generationMessage,
    onStyleChange,
    onCountChange,
    onBackgroundChange,
    onAttireChange,
    onGenerate
  } = props;
  const selectedIsTraining = activeTrainingJob?.id === selectedModel?.id;
  const noCredits = credits.blue < count;
  const disabled = !selectedModel || selectedIsTraining || noCredits || !!activeGenerationJob;

  return (
    <section className="rounded-[18px] border border-line bg-surface px-7 py-[26px] shadow-[0_22px_48px_-38px_rgba(28,26,23,.5)]" aria-label="New generation">
      <div className="mb-[22px] flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[.15em] text-ink-muted">New generation</span>
        <span className="text-[12.5px] text-ink-muted">1 blue credit per photo</span>
      </div>
      <div className="mb-5">
        <label className="mb-[11px] block text-[13.5px] font-semibold text-ink">Style</label>
        <RovingRadioGroup
          label="Style"
          value={style}
          options={STYLE_OPTIONS.map(option => option.value)}
          onChange={onStyleChange}
          className="grid grid-cols-3 gap-[13px] max-[860px]:grid-cols-1"
          render={(value, active) => {
            const option = STYLE_OPTIONS.find(item => item.value === value)!;
            return (
              <span className={cn(
                "relative flex min-h-[116px] flex-col gap-1.5 rounded-[13px] border-[1.5px] px-[17px] py-4 text-left transition",
                active ? "border-sage bg-sage-tint" : "border-line bg-bg hover:border-line-strong"
              )}>
                <span className={cn(
                  "absolute right-3.5 top-3.5 flex size-[18px] items-center justify-center rounded-full bg-sage text-white transition",
                  active ? "scale-100 opacity-100" : "scale-75 opacity-0"
                )}>
                  <Check className="size-[11px]" />
                </span>
                <span className="pr-5 text-[15px] font-bold text-ink">{option.label}</span>
                <span className="text-[12.5px] leading-[1.45] text-ink-soft">{option.description}</span>
              </span>
            );
          }}
        />
      </div>
      <div className="mb-1 flex gap-10 max-[860px]:flex-col max-[860px]:gap-5">
        <ChipGroup label="Background" optional options={BACKGROUND_OPTIONS} value={background} onChange={onBackgroundChange} />
        <ChipGroup label="Attire" optional options={ATTIRE_OPTIONS} value={attire} onChange={onAttireChange} />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-5 border-t border-line pt-[22px]">
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="text-[13.5px] font-semibold text-ink">Count</span>
          <RovingRadioGroup
            label="Count"
            value={count}
            options={COUNT_OPTIONS}
            onChange={onCountChange}
            className="inline-flex items-center gap-[3px] rounded-[11px] border border-line bg-bg-2 p-1"
            render={(value, active) => (
              <span className={cn(
                "block min-w-[38px] rounded-lg px-3 py-[7px] text-center text-sm font-semibold transition",
                active ? "bg-surface text-ink shadow-sm" : "text-ink-soft"
              )}>{value}</span>
            )}
          />
          <span className="text-[12.5px] text-ink-muted">photos</span>
          {noCredits ? (
            <Link href="/pricing" className="text-[13px] font-semibold text-sage-deep underline underline-offset-4">Buy blue credits</Link>
          ) : (
            <span className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-ink-soft"><CreditDot tone="blue" />{count} blue credits</span>
          )}
        </div>
        <Button type="button" variant="sage" onClick={onGenerate} disabled={disabled} className="h-auto rounded-xl px-[26px] py-3.5 text-[15px]">
          {activeGenerationJob ? <Loader2 className="dsh-task-spin size-[18px]" /> : <Sparkles className="size-[18px]" />}
          Generate headshots
        </Button>
      </div>
      {selectedIsTraining ? <p className="mt-3 text-sm text-ink-muted">Model is still training. You can keep working, but generation unlocks when it is ready.</p> : null}
      {generationMessage ? <p className="mt-3 text-sm text-red-600">{generationMessage}</p> : null}
    </section>
  );
}

function RecentList({ activeGenerationJob, jobs, onOpenImage }: DashboardWorkspaceProps) {
  const doneJobs = jobs.filter(job => job.status === "done").slice(0, 3);
  return (
    <section className="flex flex-col gap-[11px]" aria-label="Recent generations">
      <div className="flex items-center justify-between px-0.5 pb-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[.15em] text-ink-muted">Recent</span>
        <button type="button" className="dsh-focus inline-flex items-center gap-[3px] text-[13px] font-semibold text-ink-soft hover:text-ink">
          View all <ChevronRight className="size-3.5" />
        </button>
      </div>
      {activeGenerationJob ? <RunningGenerationRow job={activeGenerationJob} /> : null}
      {doneJobs.map(job => (
        <GenerationHistoryRow
          key={job.id}
          job={job}
          onOpenImage={onOpenImage}
        />
      ))}
    </section>
  );
}

function RunningGenerationRow({ job }: { job: ActiveGenerationJob }) {
  return (
    <div className="flex items-center gap-4 rounded-[14px] border border-sage-line bg-sage-tint px-4 py-[13px]">
      <div className="dsh-shimmer relative size-14 shrink-0 overflow-hidden rounded-[9px] bg-[#e6ddcf]" />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold text-ink">{job.title ?? styleLabel(job.style)} · {job.count} {job.count === 1 ? "photo" : "photos"}</div>
        <div className="text-[12.5px] text-ink-muted">{formatBackground(job.background)} · {formatRelativeTime(job.createdAt)}</div>
        <ProgressBar value={job.progress} className="mt-1.5 max-w-[300px]" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sage-line bg-surface px-[11px] py-1 text-xs font-semibold text-sage-deep">
          <Loader2 className="dsh-task-spin size-3" />Generating {job.progress}%
        </span>
        <span className="text-[11.5px] text-ink-muted">Runs in background - keep working</span>
      </div>
    </div>
  );
}

function GenerationHistoryRow({
  job,
  onOpenImage
}: {
  job: GenerateJobLike;
  onOpenImage: (url: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [signedUrls, setSignedUrls] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}/signed-urls`, { method: "POST" });
        const data = (await res.json()) as { signedUrls?: string[] };
        if (!cancelled) setSignedUrls(data.signedUrls ?? []);
      } catch {
        if (!cancelled) setSignedUrls([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.id]);

  const input = job.input;
  const style = typeof input?.style === "string" ? input.style : "professional";
  const count = typeof input?.num_images === "number" ? input.num_images : signedUrls?.length ?? 1;
  const background = typeof input?.background === "string" ? input.background : null;
  const thumbnails = signedUrls?.slice(0, 4) ?? [];
  const date = formatDate(job.completedAt ?? job.createdAt);

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <button
        type="button"
        onClick={() => setIsExpanded(value => !value)}
        className="dsh-focus flex w-full items-center gap-4 px-4 py-[13px] text-left transition hover:bg-bg"
      >
        <div className="flex size-14 shrink-0 gap-0.5 overflow-hidden rounded-[9px] bg-bg-2">
          {signedUrls === null ? (
            <PlaceholderThumb tone={0} />
          ) : thumbnails.length <= 1 ? (
            thumbnails[0] ? <img src={thumbnails[0]} alt="" className="size-full object-cover" /> : <PlaceholderThumb tone={0} />
          ) : (
            <div className="grid size-full grid-cols-2 gap-[3px]">
              {Array.from({ length: 4 }).map((_, index) =>
                thumbnails[index] ? <img key={thumbnails[index]} src={thumbnails[index]} alt="" className="size-full object-cover" /> : <PlaceholderThumb key={index} tone={index} />
              )}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-bold text-ink">{styleLabel(style)} · {count} {count === 1 ? "photo" : "photos"}</div>
          <div className="text-[12.5px] text-ink-muted">{formatBackground(background)} · {date}</div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-ink-muted transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {isExpanded ? (
        <div className="border-t border-line p-4">
          {signedUrls === null ? (
            <div className="flex items-center gap-2 py-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" />
              Loading
            </div>
          ) : signedUrls.length > 0 ? (
            <>
              <div className="mb-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void downloadAll(signedUrls)}
                  className="border-line text-ink-soft hover:bg-bg"
                >
                  <Download className="size-3.5" />
                  Download all
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {signedUrls.map((url, i) => (
                  <div key={url} className="overflow-hidden rounded-lg border border-line">
                    <button
                      type="button"
                      onClick={() => onOpenImage(url)}
                      className="block aspect-square w-full bg-bg-2"
                    >
                      <img
                        src={url}
                        alt={`Headshot ${i + 1}`}
                        className="size-full object-cover transition-opacity hover:opacity-90"
                      />
                    </button>
                    <div className="flex items-center justify-between p-2">
                      <span className="text-xs text-ink-muted">#{i + 1}</span>
                      <button
                        type="button"
                        onClick={() => void downloadUrl(url, `headshot-${i + 1}.jpg`)}
                        className="text-ink-muted transition-colors hover:text-ink-soft"
                        aria-label="Download"
                      >
                        <Download className="size-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-1 text-sm text-ink-muted">Could not load photos.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RovingRadioGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  render,
  className
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  render: (option: T, active: boolean) => React.ReactNode;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div role="radiogroup" aria-label={label} className={className}>
      {options.map((option, index) => {
        const active = option === value;
        return (
          <button
            key={String(option)}
            ref={node => { refs.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={event => {
              const dir = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 :
                ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
              if (!dir) return;
              event.preventDefault();
              const next = (index + dir + options.length) % options.length;
              onChange(options[next]);
              refs.current[next]?.focus();
            }}
            className="dsh-focus"
          >
            {render(option, active)}
          </button>
        );
      })}
    </div>
  );
}

function ChipGroup<T extends string | null>({
  label,
  optional,
  options,
  value,
  onChange
}: {
  label: string;
  optional?: boolean;
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label className="mb-[11px] block text-[13.5px] font-semibold text-ink">
        {label} {optional ? <span className="text-[12.5px] font-medium text-ink-muted">optional</span> : null}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map(option => {
          const active = option.value === value;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "dsh-focus rounded-full border px-[15px] py-2 text-[13px] font-semibold transition",
                active ? "border-sage bg-sage text-white" : "border-line-strong bg-surface text-ink-soft hover:border-ink-soft hover:text-ink"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className={cn("block h-[5px] overflow-hidden rounded-full bg-sage-tint", className)}>
      <span className="block h-full rounded-full bg-sage" style={{ width: `${pct}%` }} />
    </span>
  );
}

function EmptyModelsState({ onNewModel }: { onNewModel: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-20 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-navy-sidebar text-sage-side">
        <Sparkles className="size-7" />
      </div>
      <h2 className="text-xl font-bold text-ink">Train your first model</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
        Upload 10-15 photos to unlock personalized headshots and keep generation consistent.
      </p>
      <Button type="button" variant="sage" onClick={onNewModel} className="mt-6 h-auto rounded-xl px-[26px] py-3.5">
        <Plus className="size-4" />Train your first model
      </Button>
    </div>
  );
}

function TrainingOnlyState({ job, elapsed }: { job: TrainingJobLike | null; elapsed: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-20 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-sage-tint text-sage">
        <Loader2 className="dsh-ring size-7" />
      </div>
      <h2 className="text-xl font-bold text-ink">{job ? getModelName(job) : "Model"} is training</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
        Training runs in the background. You can keep using the app and generate once the model is ready.
      </p>
      <p className="mt-4 text-sm font-semibold text-sage-deep">Training · {formatElapsed(elapsed)}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">
      <Loader2 className="dsh-ring mr-2 size-4" />
      Loading dashboard
    </div>
  );
}

function ModelButton({
  model,
  active,
  trainingElapsed,
  onClick
}: {
  model: TrainingJobLike;
  active: boolean;
  trainingElapsed?: number;
  onClick: () => void;
}) {
  const name = getModelName(model);
  const training = model.status === "pending" || model.status === "processing";
  const photoCount = getPhotoCount(model);
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "dsh-focus relative flex w-full items-center gap-[11px] rounded-xl p-2.5 text-left transition hover:bg-white/[.045]",
        active && "bg-[color-mix(in_srgb,var(--sage-side)_17%,transparent)] before:absolute before:bottom-[9px] before:left-[-14px] before:top-[9px] before:w-[3px] before:rounded-r-[3px] before:bg-sage-side"
      )}
    >
      <span className={cn("flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-sm font-bold", training ? "bg-[#2a3354] text-[#aeb6d4]" : "bg-white text-navy-sidebar")}>
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-[#eef0f6]">{name}</span>
        <span className="block truncate text-[11.5px] text-[#7e87a6]">
          {training ? `Training · ${trainingElapsed ? formatElapsed(trainingElapsed) : "~6 min left"}` : `Ready · ${photoCount} photos`}
        </span>
      </span>
      {training ? <Loader2 className="dsh-ring size-[15px] shrink-0 text-sage-side" aria-label="Training" /> : <span className="size-[7px] shrink-0 rounded-full bg-ready" />}
    </button>
  );
}

function CreditRow({ tone, label, value }: { tone: "blue" | "gold"; label: string; value: number }) {
  return (
    <div className="flex items-center gap-[9px] px-0.5 py-1">
      <CreditDot tone={tone} />
      <span className="flex-1 text-[13px] text-[#aeb6d4]">{label}</span>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  );
}

function CreditBucketDetails({ credits }: { credits: DashboardWorkspaceProps["credits"] }) {
  const subscriptionTotal = (credits.subscriptionBlue ?? 0) + (credits.subscriptionGold ?? 0);
  const packTotal = (credits.packBlue ?? 0) + (credits.packGold ?? 0);
  if (subscriptionTotal === 0 && packTotal === 0) return null;

  const expires = credits.subscriptionCurrentPeriodEnd ? formatShortDate(credits.subscriptionCurrentPeriodEnd) : null;
  return (
    <div className="mt-1 border-t border-white/[.06] pt-2 text-[11.5px] leading-relaxed text-[#8b93ad]">
      {subscriptionTotal > 0 ? (
        <div>
          {credits.subscriptionBlue ?? 0} blue / {credits.subscriptionGold ?? 0} gold expire{expires ? ` ${expires}` : " with plan"}
        </div>
      ) : null}
      {packTotal > 0 ? (
        <div>{credits.packBlue ?? 0} blue / {credits.packGold ?? 0} gold permanent</div>
      ) : null}
    </div>
  );
}

function CreditDot({ tone }: { tone: "blue" | "gold" }) {
  return <span className={cn("size-[9px] shrink-0 rounded-full", tone === "blue" ? "bg-blue" : "bg-gold")} />;
}

function PlaceholderThumb({ tone }: { tone: number }) {
  const colors = ["#dfe3ea", "#e7ddcd", "#dde6df", "#e8dde6"];
  return (
    <span
      className="block size-full rounded-md bg-bg-2 [background-image:repeating-linear-gradient(135deg,rgba(120,112,98,.10)_0_6px,rgba(120,112,98,0)_6px_12px)]"
      style={{ backgroundColor: colors[tone % colors.length] }}
    />
  );
}

function NavLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-2 pt-3.5 text-[10.5px] font-bold uppercase tracking-[.14em] text-[#6b7497]">{children}</div>;
}

function getModelName(job: TrainingJobLike): string {
  const name = job.input?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return new Date(job.createdAt).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getPhotoCount(job: TrainingJobLike) {
  const archive = job.input?.archive_url;
  if (typeof archive !== "string") return 18;
  try {
    const parsed = JSON.parse(archive);
    return Array.isArray(parsed) ? parsed.length : 18;
  } catch {
    return 18;
  }
}

function styleLabel(value: string) {
  return STYLE_OPTIONS.find(option => option.value === value)?.label ?? value;
}

function formatBackground(value: unknown) {
  if (typeof value !== "string" || !value) return "Default background";
  return `${value.charAt(0).toUpperCase()}${value.slice(1)} background`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatShortDate(value: Date | string) {
  return new Date(value).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short"
  });
}

function formatRelativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "started now";
  const minutes = Math.floor(seconds / 60);
  return `started ${minutes} min ago`;
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m === 0 ? `${s}s` : `${m}m ${String(s).padStart(2, "0")}s`;
}

async function downloadAll(urls: string[]) {
  for (let i = 0; i < urls.length; i++) {
    await downloadUrl(urls[i], `headshot-${i + 1}.jpg`);
  }
}

async function downloadUrl(url: string, filename: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
