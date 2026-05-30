import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
    }
  });
}

export function isR2LoraKey(value: string): boolean {
  return value.startsWith("r2:loras/");
}

export async function storeLoraFileR2(input: { userId: string; jobId: string; bytes: ArrayBuffer }): Promise<string> {
  const key = `loras/${input.userId}/${input.jobId}/model.safetensors`;
  await getR2Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: Buffer.from(input.bytes),
    ContentType: "application/octet-stream"
  }));
  return `r2:${key}`;
}

export async function createLoraSignedUrlR2(r2Key: string): Promise<string> {
  const key = r2Key.replace(/^r2:/, "");
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }),
    { expiresIn: 60 * 60 }
  );
}

const SIGNED_URL_TTL_SECONDS = 60 * 10;
const LORA_SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function storeLoraFile(input: {
  userId: string;
  jobId: string;
  bytes: ArrayBuffer;
}): Promise<string> {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results";
  const path = `loras/${input.userId}/${input.jobId}/model.safetensors`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(bucket).upload(path, input.bytes, {
    upsert: true,
    contentType: "application/octet-stream"
  });
  if (error) throw error;
  return path;
}

export async function createLoraSignedUrl(path: string): Promise<string> {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results";
  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(bucket)
    .createSignedUrl(path, LORA_SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

export function isSupabaseLoraPath(value: string): boolean {
  return value.startsWith("loras/");
}

export async function storeAiResult(input: {
  userId: string;
  jobId: string;
  bytes: ArrayBuffer;
  contentType: string;
  extension: string;
}) {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results";
  const path = `${input.userId}/${input.jobId}.${input.extension}`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(bucket).upload(path, input.bytes, {
    upsert: true,
    contentType: input.contentType
  });
  if (error) throw error;

  return path;
}

export async function createSignedResultUrl(path: string, options?: { download?: boolean }) {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results";
  const objectPath = normalizeStoragePath(path, bucket);
  if (!objectPath) return path;

  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(bucket)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS, { download: options?.download ?? false });

  if (error) throw error;
  return data.signedUrl;
}

export function normalizeStoragePath(pathOrUrl: string, bucket: string) {
  if (!pathOrUrl.startsWith("http://") && !pathOrUrl.startsWith("https://")) return pathOrUrl;

  try {
    const url = new URL(pathOrUrl);
    const publicPrefix = `/storage/v1/object/public/${bucket}/`;
    const signedPrefix = `/storage/v1/object/sign/${bucket}/`;
    if (url.pathname.startsWith(publicPrefix)) return decodeURIComponent(url.pathname.slice(publicPrefix.length));
    if (url.pathname.startsWith(signedPrefix)) return decodeURIComponent(url.pathname.slice(signedPrefix.length));
  } catch {
    return null;
  }

  return null;
}
