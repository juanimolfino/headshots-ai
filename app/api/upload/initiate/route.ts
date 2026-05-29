import { NextResponse } from "next/server";
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

function validateInput(input: { filename?: unknown; contentType?: unknown; size?: unknown }) {
  if (typeof input.filename !== "string" || !input.filename.trim()) return "filename is required";
  if (typeof input.contentType !== "string" || !ALLOWED_IMAGE_TYPES.has(input.contentType)) {
    return "contentType must be image/jpeg or image/png";
  }
  if (typeof input.size !== "number" || !Number.isFinite(input.size) || input.size <= 0) return "size is required";
  if (input.size > MAX_FILE_SIZE_BYTES) return `${input.filename} cannot exceed 10MB`;

  const extension = getExtension(input.filename);
  if (!ALLOWED_EXTENSIONS.has(extension)) return `${input.filename} must be a jpg, jpeg, or png image`;

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

  const response = await fetch("https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content_type: body.contentType,
      file_name: body.filename
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return jsonError(typeof data?.detail === "string" ? data.detail : "Could not initiate fal upload", response.status);
  }

  return NextResponse.json({
    uploadUrl: data.upload_url,
    fileUrl: data.file_url
  });
}
