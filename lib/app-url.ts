const fallbackAppUrl = "http://localhost:3000";

export function getAppUrl(origin?: string) {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin ?? fallbackAppUrl;
  const urlWithProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  return urlWithProtocol.replace(/\/+$/, "");
}

export function getAppUrlObject(origin?: string) {
  return new URL(getAppUrl(origin));
}
