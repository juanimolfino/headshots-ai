import { fal } from "@fal-ai/client";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MIN_FILES = 10;
const MAX_FILES = 15;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function validateFiles(files: File[]) {
  if (files.length < MIN_FILES) {
    return `Upload at least ${MIN_FILES} image files`;
  }

  if (files.length > MAX_FILES) {
    return `Upload no more than ${MAX_FILES} image files`;
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_TOTAL_SIZE_BYTES) {
    return "Total upload size cannot exceed 100MB";
  }

  for (const file of files) {
    const filename = file.name || "unnamed file";
    const extension = getExtension(filename);

    if (!ALLOWED_IMAGE_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(extension)) {
      return `${filename} must be a jpg, jpeg, or png image`;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `${filename} cannot exceed 10MB`;
    }
  }

  return null;
}

async function uploadFile(file: File, index: number) {
  try {
    return await fal.storage.upload(file);
  } catch (error) {
    const filename = file.name || `file ${index + 1}`;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not upload ${filename}: ${message}`);
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonError("Expected multipart/form-data with files field", 400);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Could not parse multipart/form-data", 400);
  }

  const values = formData.getAll("files");
  if (!values.every((value): value is File => value instanceof File)) {
    return jsonError("The files field must contain only image files", 400);
  }

  const validationError = validateFiles(values);
  if (validationError) return jsonError(validationError, 400);

  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const urls = await Promise.all(values.map(uploadFile));
    return NextResponse.json({ urls, count: urls.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload files to fal.storage";
    return jsonError(message, 500);
  }
}
