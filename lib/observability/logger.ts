type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  area?: string;
  route?: string;
  function?: string;
  userId?: string | null;
  jobId?: string | null;
  jobType?: string | null;
  stripeEventId?: string | null;
  stripeEventType?: string | null;
  falRequestId?: string | null;
  requestId?: string | null;
  durationMs?: number | null;
  code?: string | null;
  message?: string | null;
  [key: string]: unknown;
};

function isSensitiveKey(key: string) {
  return /token|secret|password|authorization|cookie|api[_-]?key|signature|image|photo|payload|body|url/i.test(key);
}

function safeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 10).map(item => safeValue(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      output[key] = isSensitiveKey(key) ? "[redacted]" : safeValue(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

export function buildLogPayload(level: LogLevel, event: string, context: LogContext = {}) {
  const payload: Record<string, unknown> = {
    level,
    event,
    timestamp: new Date().toISOString()
  };

  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null || value === "") continue;
    payload[key] = isSensitiveKey(key) ? "[redacted]" : safeValue(value);
  }

  return payload;
}

export function logStructured(level: LogLevel, event: string, context: LogContext = {}) {
  const line = JSON.stringify(buildLogPayload(level, event, context));
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, context?: LogContext) {
  logStructured("info", event, context);
}

export function logWarn(event: string, context?: LogContext) {
  logStructured("warn", event, context);
}

export function logError(event: string, context?: LogContext) {
  logStructured("error", event, context);
}
