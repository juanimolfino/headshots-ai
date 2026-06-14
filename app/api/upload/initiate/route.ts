import { NextResponse } from "next/server";
import { checkUploadRateLimit } from "@/lib/redis/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  initiateFalStorageUpload,
  FAL_OBJECT_LIFECYCLE_HEADER,
  FAL_SOURCE_OBJECT_EXPIRATION_SECONDS,
  falObjectLifecyclePreference
} from "@/lib/fal/privacy";
import { ensureUserProfile } from "@/lib/db/queries";
import { hasCurrentLegalConsent, hasCurrentPhotoProcessingConsent } from "@/lib/legal/consent";

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

function validateInput(input: { filename?: unknown; contentType?: unknown; size?: unknown; purpose?: unknown }) {
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
  if (input.purpose !== "training-source" && input.purpose !== "quick-edit-reference") {
    return "purpose must be training-source or quick-edit-reference";
  }

  return null;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  let body: { filename?: unknown; contentType?: unknown; size?: unknown; purpose?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected JSON body", 400);
  }

  const validationError = validateInput(body);
  if (validationError) return jsonError(validationError, 400);

  let profile;
  try {
    profile = await ensureUserProfile(user);
  } catch {
    return jsonError("Could not load profile", 500);
  }

  if (!hasCurrentLegalConsent(profile)) {
    return jsonError("Legal consent required before uploading photos", 403);
  }
  if (body.purpose === "training-source" && !hasCurrentPhotoProcessingConsent(profile)) {
    return jsonError("Photo processing consent required before training a model", 403);
  }

  // Rate limit: 20 initiations per user per 2 minutes
  try {
    await checkUploadRateLimit(profile.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "UPLOAD_RATE_LIMITED") return jsonError("Too many uploads. Please wait a moment.", 429);
    // If rate-limit check fails for infra reasons, allow through rather than blocking legit users
    console.warn("[upload/initiate] rate limit check failed:", message);
  }

  const safeFilename = sanitizeFilename(body.filename as string);

  const { response, data } = await initiateFalStorageUpload({
    filename: safeFilename,
    contentType: body.contentType as string,
    expirationSeconds: FAL_SOURCE_OBJECT_EXPIRATION_SECONDS
  });
  if (!response.ok) {
    return jsonError(
      typeof data?.detail === "string" ? data.detail : "Could not initiate upload",
      response.status
    );
  }

  return NextResponse.json({
    uploadUrl: data.upload_url,
    fileUrl: data.file_url,
    uploadHeaders: {
      [FAL_OBJECT_LIFECYCLE_HEADER]: falObjectLifecyclePreference(FAL_SOURCE_OBJECT_EXPIRATION_SECONDS)
    },
    expiresInSeconds: FAL_SOURCE_OBJECT_EXPIRATION_SECONDS
  });
}
