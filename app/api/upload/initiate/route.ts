import { NextResponse } from "next/server";
import { checkUploadRateLimit } from "@/lib/redis/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

// Strip path separators and special characters; truncate to 100 chars.
function sanitizeFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, "");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 100) || "upload.jpg";
}

function validateInput(input: { filename?: unknown; contentType?: unknown; size?: unknown }) {
  if (typeof input.filename !== "string" || !input.filename.trim()) return "filename is required";
  if (typeof input.contentType !== "string" || !ALLOWED_IMAGE_TYPES.has(input.contentType)) {
    return "contentType must be image/jpeg or image/png";
  }
  if (typeof input.size !== "number" || !Number.isFinite(input.size) || input.size <= 0) {
    return "size is required";
  }
  if (input.size > MAX_FILE_SIZE_BYTES) return `File cannot exceed 10 MB`;

  const extension = getExtension(input.filename);
  if (!ALLOWED_EXTENSIONS.has(extension)) return `File must be a JPG or PNG image`;

  return null;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  let body: { filename?: unknown; contentType?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected JSON body", 400);
  }

  const validationError = validateInput(body);
  if (validationError) return jsonError(validationError, 400);

  // Rate limit: 20 initiations per user per 2 minutes
  try {
    const { ensureUserProfile } = await import("@/lib/db/queries");
    const profile = await ensureUserProfile(user);
    await checkUploadRateLimit(profile.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "UPLOAD_RATE_LIMITED") return jsonError("Too many uploads. Please wait a moment.", 429);
    // If rate-limit check fails for infra reasons, allow through rather than blocking legit users
    console.warn("[upload/initiate] rate limit check failed:", message);
  }

  const safeFilename = sanitizeFilename(body.filename as string);

  const response = await fetch("https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content_type: body.contentType,
      file_name: safeFilename
    })
  });

  const data = (await response.json()) as { upload_url?: string; file_url?: string; detail?: unknown };
  if (!response.ok) {
    return jsonError(
      typeof data?.detail === "string" ? data.detail : "Could not initiate upload",
      response.status
    );
  }

  return NextResponse.json({
    uploadUrl: data.upload_url,
    fileUrl: data.file_url
  });
}
