import { createHash } from "node:crypto";
import { sendTelegramErrorAlert } from "@/lib/notifications/telegram";
import { checkRateLimit } from "@/lib/redis/rate-limit";

type ReportSeverity = "critical" | "warning";

export type ReportErrorContext = {
  area: string;
  severity?: ReportSeverity;
  alert?: boolean;
  throttleKey?: string;
  throttleWindowSeconds?: number;
  userId?: string | null;
  jobId?: string | null;
  jobType?: string | null;
  stripeEventId?: string | null;
  stripeEventType?: string | null;
  falRequestId?: string | null;
  route?: string | null;
  status?: number | string | null;
  [key: string]: unknown;
};

type SerializedError = {
  name?: string;
  message: string;
  stack?: string;
  [key: string]: unknown;
};

const localAlertThrottle = new Map<string, number>();

function jsonSafe(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeError(value);
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 10).map(item => jsonSafe(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 25)) {
      output[key] = isSensitiveKey(key) ? "[redacted]" : jsonSafe(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

function isSensitiveKey(key: string) {
  return /token|secret|password|authorization|cookie|api[_-]?key|signature/i.test(key);
}

export function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) return { message: String(error) };
  const details: SerializedError = {
    name: error.name,
    message: error.message,
    stack: error.stack
  };

  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === "name" || key === "message" || key === "stack") continue;
    details[key] = jsonSafe((error as unknown as Record<string, unknown>)[key]);
  }

  return details;
}

function cleanContext(context: ReportErrorContext) {
  const { alert, throttleKey, throttleWindowSeconds, severity, ...rest } = context;
  void alert;
  void throttleKey;
  void throttleWindowSeconds;
  void severity;

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === null || value === "") continue;
    output[key] = isSensitiveKey(key) ? "[redacted]" : jsonSafe(value);
  }
  return output;
}

function fingerprintFor(error: SerializedError, context: ReportErrorContext) {
  const raw = context.throttleKey ?? `${context.area}:${error.name ?? "Error"}:${error.message}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

async function shouldSendAlert(fingerprint: string, windowSeconds: number) {
  const now = Date.now();
  const localUntil = localAlertThrottle.get(fingerprint) ?? 0;
  if (localUntil > now) return false;
  localAlertThrottle.set(fingerprint, now + windowSeconds * 1000);

  try {
    await checkRateLimit(`alerts:error:${fingerprint}`, 1, windowSeconds);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "RATE_LIMITED") return false;
    console.warn(JSON.stringify({
      level: "warn",
      code: "ERROR_ALERT_THROTTLE_UNAVAILABLE",
      message
    }));
    return true;
  }
}

export function isLikelyExternalProviderIncident(error: unknown) {
  const serialized = serializeError(error);
  const text = JSON.stringify(serialized).toLowerCase();
  return (
    /\b(401|403|429|500|502|503|504)\b/.test(text) ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("rate limit") ||
    text.includes("quota") ||
    text.includes("unavailable") ||
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("fetch failed") ||
    text.includes("credits exhausted")
  );
}

export async function reportError(error: unknown, context: ReportErrorContext) {
  const severity = context.severity ?? "critical";
  const serializedError = serializeError(error);
  const contextPayload = cleanContext(context);
  const fingerprint = fingerprintFor(serializedError, context);
  const payload = {
    level: severity === "critical" ? "error" : "warn",
    code: "APP_ERROR",
    timestamp: new Date().toISOString(),
    fingerprint,
    severity,
    error: serializedError,
    context: contextPayload
  };

  console.error(JSON.stringify(payload));

  if (context.alert === false) return payload;
  const shouldAlert = await shouldSendAlert(fingerprint, context.throttleWindowSeconds ?? 5 * 60);
  if (!shouldAlert) return payload;

  await sendTelegramErrorAlert({
    area: context.area,
    severity,
    message: serializedError.message,
    fingerprint,
    context: contextPayload
  });

  return payload;
}
