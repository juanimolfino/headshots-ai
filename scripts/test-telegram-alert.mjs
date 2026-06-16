/**
 * Sends a single operational alert through the same Telegram path used by reportError().
 * This is isolated: it does not touch the database or user-facing jobs.
 *
 * Usage:
 *   npx tsx scripts/test-telegram-alert.mjs
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID
 *
 * Optional but loaded the same way as production/local app env:
 *   .env.local, or production env vars already present in the shell
 */

import nextEnv from "@next/env";
import { reportError } from "../lib/observability/report-error.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function envValue(key) {
  const value = process.env[key]?.trim();
  return value ? value : null;
}

const telegramBotToken = envValue("TELEGRAM_BOT_TOKEN");
const telegramChatId = envValue("TELEGRAM_CHAT_ID");

if (!telegramBotToken || !telegramChatId) {
  console.error("FAIL TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set");
  process.exit(1);
}

const testMessage = "[TEST] Esto es una prueba de alerta, ignorar";
const testRunId = `telegram-alert-test-${Date.now()}`;

console.log("Sending Telegram alert test with:");
console.log(`  TELEGRAM_BOT_TOKEN: ${telegramBotToken.slice(0, 4)}…`);
console.log(`  TELEGRAM_CHAT_ID: ${telegramChatId}`);
console.log(`  testRunId: ${testRunId}`);

try {
  const payload = await reportError(new Error(testMessage), {
    area: "observability.telegram-test",
    severity: "critical",
    alert: true,
    throttleKey: `telegram-test:${testRunId}`,
    throttleWindowSeconds: 1,
    route: "/scripts/test-telegram-alert.mjs",
    code: "TEST_TELEGRAM_ALERT",
    testRunId
  });

  console.log("OK Telegram alert sent");
  console.log(JSON.stringify({
    code: payload.code,
    severity: payload.severity,
    fingerprint: payload.fingerprint,
    area: payload.context?.area ?? "observability.telegram-test"
  }, null, 2));
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
