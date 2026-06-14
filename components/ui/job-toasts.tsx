"use client";

import { CheckCircle2, Info, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobToastEvent } from "@/lib/job-toast-events";
import { cn } from "@/lib/utils";

export type JobToastItem = JobToastEvent & {
  id: string;
};

export function JobToasts({
  toasts,
  onDismiss,
  onAction
}: {
  toasts: JobToastItem[];
  onDismiss: (id: string) => void;
  onAction: (toast: JobToastItem) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-relevant="additions removals"
      className="fixed right-4 top-4 z-[80] flex w-[min(360px,calc(100vw-32px))] flex-col gap-3"
    >
      {toasts.map(toast => {
        const isFailure = toast.kind === "failure";
        const isRefund = toast.kind === "refund";
        const Icon = isFailure ? Info : isRefund ? RefreshCw : CheckCircle2;
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "rounded-[14px] border bg-surface p-4 shadow-[0_22px_46px_-30px_rgba(20,27,50,.55)]",
              isFailure ? "border-red-200 bg-red-50" : isRefund ? "border-blue/25 bg-white" : "border-ready-line bg-ready-bg"
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                  isFailure ? "bg-white text-red-600" : isRefund ? "bg-blue/10 text-blue" : "bg-white text-ready"
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-bold", isFailure ? "text-red-900" : "text-ink")}>{toast.title}</p>
                <p className={cn("mt-1 text-sm leading-relaxed", isFailure ? "text-red-700" : "text-ink-soft")}>
                  {toast.description}
                </p>
                {toast.actionLabel ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onAction(toast)}
                    className={cn(
                      "mt-3 h-8 rounded-lg px-3 text-xs",
                      isFailure ? "border-red-200 text-red-700 hover:bg-red-50" : "border-line text-ink-soft hover:bg-bg"
                    )}
                  >
                    {toast.actionLabel}
                  </Button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="rounded-md p-1 text-ink-muted transition hover:bg-black/5 hover:text-ink"
                aria-label="Cerrar notificacion"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
