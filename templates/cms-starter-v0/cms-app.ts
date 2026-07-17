/**
 * Shared TomorrowOS app for local Node and Vercel Functions.
 * - Local / Railway-style: `server.ts` imports this (autoListen binds PORT).
 * - Vercel Production: `api/index.ts` re-exports `server` (VERCEL → no listen;
 *   Fluid Function owns the socket — see https://vercel.com/docs/functions/websockets).
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createTomorrowOSStore, TomorrowOS } from "@tomorrowos/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const brand = JSON.parse(readFileSync(join(__dirname, "brand.json"), "utf8"));
const store = createTomorrowOSStore({
  databaseUrl:
    process.env.SUPABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_URL,
  sqlitePath: join(__dirname, "data", "tomorrowos.db")
});

export const tomorrowos = new TomorrowOS({ brand, store });

const port = Number(
  process.env.TOMORROWOS_INTERNAL_PORT || process.env.PORT || 3000
);

export const server = tomorrowos.listen({
  port,
  host: "0.0.0.0",
  staticRoot: join(__dirname, "cms-panel")
  // autoListen defaults to false when process.env.VERCEL is set
});

tomorrowos.on("device.paired", (event) => {
  console.log(`[TomorrowOS] device paired: ${event.deviceId}`);
  void tomorrowos.pushLatestPolicyToDevice(event.deviceId).then((r) => {
    if (r.pushed) {
      console.log(`[TomorrowOS] pushed latest policy to ${event.deviceId} (paired)`);
    }
  }).catch((err) => {
    console.error(`[TomorrowOS] policy push on paired failed for ${event.deviceId}:`, err);
  });
});

tomorrowos.on("device.online", (event) => {
  console.log(`[TomorrowOS] device online: ${event.deviceId}`);
  void tomorrowos.pushLatestPolicyToDevice(event.deviceId).then((r) => {
    if (r.pushed) {
      console.log(`[TomorrowOS] pushed latest policy to ${event.deviceId}`);
    }
  }).catch((err) => {
    console.error(`[TomorrowOS] latest policy push failed for ${event.deviceId}:`, err);
  });
});

tomorrowos.on("device.offline", (event) => {
  console.log(
    `[TomorrowOS] device offline: ${event.deviceId} (lastSeen: ${event.lastSeen})`
  );
});

tomorrowos.on("command.verified", (event) => {
  console.log(
    `[TomorrowOS] command verified: ${event.commandId} (${event.method})`
  );
});

tomorrowos.on("command.failed", (event) => {
  console.error(
    `[TomorrowOS] command failed: ${event.commandId} (${event.method}) — ${event.error.message}`
  );
});
