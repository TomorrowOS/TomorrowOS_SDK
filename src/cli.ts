#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { PoolConfig } from "pg";

import { migrateTomorrowOSData } from "./store/migration.js";
import { PostgresStore } from "./store/postgres-store.js";
import { SQLiteStore } from "./store/sqlite-store.js";
import type { TomorrowOSMigratableStore } from "./store/types.js";

function packageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function getSdkVersion(): string {
  const pkgPath = path.join(packageRoot(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

const STARTER_SKIP_DIRS = new Set(["node_modules", ".replit-artifact"]);
const STARTER_SKIP_FILES = new Set(["package-lock.json", ".env"]);

/** Never ship local install artifacts into a new CMS project. */
function shouldCopyStarterEntry(starterRoot: string, source: string): boolean {
  const rel = path.relative(starterRoot, source);
  if (!rel) return true;
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.some((p) => STARTER_SKIP_DIRS.has(p))) return false;
  if (STARTER_SKIP_FILES.has(path.basename(source))) return false;
  return true;
}

function removeStarterArtifacts(destDir: string): void {
  const lockPath = path.join(destDir, "package-lock.json");
  const modulesPath = path.join(destDir, "node_modules");
  if (fs.existsSync(lockPath)) fs.rmSync(lockPath, { force: true });
  if (fs.existsSync(modulesPath)) fs.rmSync(modulesPath, { recursive: true, force: true });
}

function initializeStarterSQLite(destDir: string): string {
  const dbPath = path.join(path.resolve(destDir), "data", "tomorrowos.db");
  const store = new SQLiteStore(dbPath);
  store.close();
  return dbPath;
}

/** Align generated cms-starter package.json with the installed SDK version. */
function patchStarterPackageJson(destDir: string): void {
  const pkgPath = path.join(path.resolve(destDir), "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const ver = getSdkVersion();
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    version?: string;
    dependencies?: Record<string, string>;
  };

  pkg.version = ver;
  if (pkg.dependencies?.["@tomorrowos/sdk"]) {
    pkg.dependencies["@tomorrowos/sdk"] = `^${ver}`;
  }

  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function copyStarter(destDir: string, force: boolean, hosting: StarterHosting): void {
  const templateName = hosting === "replit" ? "cms-starter" : "cms-starter-v0";
  const src = path.join(packageRoot(), "templates", templateName);
  if (!fs.existsSync(src)) {
    console.error(
      `[tomorrowos] Starter template "${templateName}" not found. Re-install @tomorrowos/sdk (templates should ship with the package).`
    );
    process.exit(1);
  }

  const resolved = path.resolve(destDir);
  if (fs.existsSync(resolved)) {
    const entries = fs.readdirSync(resolved);
    if (entries.length > 0 && !force) {
      console.error(
        `[tomorrowos] Target directory is not empty: ${resolved}\nUse --force to copy anyway.`
      );
      process.exit(1);
    }
  } else {
    fs.mkdirSync(resolved, { recursive: true });
  }

  fs.cpSync(src, resolved, {
    recursive: true,
    filter: (source) => shouldCopyStarterEntry(src, source),
  });
  patchStarterPackageJson(resolved);
  removeStarterArtifacts(resolved);
  const dbPath = initializeStarterSQLite(resolved);

  const sdkVer = getSdkVersion();
  console.log(`[tomorrowos] Created CMS project at ${resolved}`);
  console.log(`[tomorrowos] Template: ${templateName} (--hosting ${hosting})`);
  console.log(`[tomorrowos] @tomorrowos/sdk dependency: ^${sdkVer}`);
  console.log(`[tomorrowos] Initialized SQLite database: ${dbPath}`);
  console.log(`[tomorrowos] Env template: ${path.join(resolved, ".env.example")}`);
  if (hosting === "replit") {
    console.log("Next: npm install, then npm start (see REPLIT_SETUP.md on Replit)");
  } else {
    console.log("Next: npm install, then npm start (see VERCEL_SETUP.md for v0 / Vercel Publish)");
  }
}

type StarterHosting = "replit" | "v0" | "vercel";

function parseHostingFlag(argv: string[]): StarterHosting {
  const raw = optionValue(argv, "--hosting")?.trim().toLowerCase();
  if (!raw || raw === "replit" || raw === "here") return "replit";
  if (raw === "v0" || raw === "vercel") return raw === "v0" ? "v0" : "vercel";
  throw new Error('--hosting must be "replit", "v0", or "vercel".');
}

function cmdBuild(argv: string[]): void {
  const platformIdx = argv.indexOf("--platform");
  const platform =
    platformIdx >= 0 && argv[platformIdx + 1] ? argv[platformIdx + 1] : "(unspecified)";

  console.error(
    `[tomorrowos] "tomorrowos build" does not package players. No file was produced for platform "${platform}".`
  );
  console.error(
    "Download a verified prebuilt player from your running Control Panel (Download Players), or from the player repositories."
  );
  console.error(
    "Tizen: Control Panel → Download Players → Samsung (or https://tmr.sh/app/tizen/). BrightSign: Control Panel → Download Players → BrightSign (GET /players/brightsign.zip)."
  );
  console.error("See PLAYER_INSTALL.md for install and pairing steps.");
  process.exit(1);
}

type MigratableDriver = "sqlite" | "postgres" | "supabase";

interface CliStoreHandle {
  label: string;
  store: TomorrowOSMigratableStore;
  close: () => Promise<void>;
}

function optionValue(argv: string[], name: string): string | undefined {
  const withEquals = `${name}=`;
  const found = argv.find((arg) => arg.startsWith(withEquals));
  if (found) return found.slice(withEquals.length);

  const idx = argv.indexOf(name);
  if (idx >= 0) return argv[idx + 1];
  return undefined;
}

function normalizeDriver(raw: string | undefined, side: "from" | "to"): MigratableDriver {
  const driver = String(raw || "").trim().toLowerCase();
  if (driver === "sqlite" || driver === "postgres" || driver === "supabase") {
    return driver;
  }
  throw new Error(`--${side} must be sqlite, postgres, or supabase.`);
}

function resolvePostgresSsl(raw: string | undefined, databaseUrl: string): PoolConfig["ssl"] {
  const value = raw?.trim().toLowerCase();
  if (value === "false" || value === "0" || value === "off") return false;
  if (value === "true" || value === "1" || value === "on") {
    return { rejectUnauthorized: false };
  }
  if (/supabase\.(co|com)|sslmode=require/i.test(databaseUrl)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function createMigrationStore(
  argv: string[],
  side: "from" | "to"
): CliStoreHandle {
  const driver = normalizeDriver(optionValue(argv, `--${side}`), side);

  if (driver === "sqlite") {
    const dbPath =
      optionValue(argv, `--${side}-sqlite`) ??
      optionValue(argv, `--${side}-sqlite-path`);
    if (!dbPath) {
      throw new Error(
        `--${side}=sqlite requires --${side}-sqlite ./data/tomorrowos.db`
      );
    }
    const store = new SQLiteStore(dbPath);
    return {
      label: `sqlite:${path.resolve(dbPath)}`,
      store,
      close: async () => store.close()
    };
  }

  const databaseUrl =
    optionValue(argv, `--${side}-database-url`) ??
    optionValue(argv, `--${side}-url`);
  if (!databaseUrl) {
    throw new Error(
      `--${side}=${driver} requires --${side}-database-url postgresql://...`
    );
  }
  const store = new PostgresStore({
    connectionString: databaseUrl,
    ssl: resolvePostgresSsl(optionValue(argv, `--${side}-database-ssl`), databaseUrl)
  });
  return {
    label: `${driver}:DATABASE_URL`,
    store,
    close: async () => store.close()
  };
}

async function cmdMigrate(argv: string[]): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    printMigrateHelp();
    return;
  }

  const from = createMigrationStore(argv, "from");
  const to = createMigrationStore(argv, "to");

  try {
    console.log(`[tomorrowos] Migrating data from ${from.label} to ${to.label}`);
    const result = await migrateTomorrowOSData(from.store, to.store);
    console.log("[tomorrowos] Migration complete:");
    console.log(`  pending codes: ${result.pendingCodes}`);
    console.log(`  device registry records: ${result.deviceRegistry}`);
    console.log(`  paired devices: ${result.pairedDevices}`);
    console.log(`  playlists: ${result.playlists}`);
    console.log(`  device assignments: ${result.deviceAssignments}`);
    console.log(
      "[tomorrowos] Note: media files in public/uploads or object storage are not copied by database migration."
    );
  } finally {
    await Promise.allSettled([from.close(), to.close()]);
  }
}

function printHelp(): void {
  console.log(`tomorrowos — TomorrowOS SDK CLI

Usage:
  tomorrowos init [directory]     Copy cms-starter template (default: Replit / Railway)
  tomorrowos migrate [options]    Migrate TomorrowOS data between supported databases

Options:
  --hosting replit|v0|vercel      init template: replit (default) or Vercel/v0 (cms-starter-v0)
  --force                         With init: copy into a non-empty directory

Examples:
  npx @tomorrowos/sdk@latest init .
  npx @tomorrowos/sdk@latest init ./my-cms --hosting replit
  npx @tomorrowos/sdk@latest init ./my-cms --hosting v0
  npx @tomorrowos/sdk@latest migrate --from sqlite --from-sqlite ./data/tomorrowos.db --to supabase --to-database-url "$DATABASE_URL"

Player packages are not built by this CLI. Use Control Panel → Download Players, or see PLAYER_INSTALL.md.
`);
}

function printMigrateHelp(): void {
  console.log(`tomorrowos migrate — migrate TomorrowOS SDK data

Supported stores:
  sqlite
  postgres
  supabase

Examples:
  tomorrowos migrate --from sqlite --from-sqlite ./data/tomorrowos.db --to supabase --to-database-url "$DATABASE_URL"
  tomorrowos migrate --from supabase --from-database-url "$DATABASE_URL" --to sqlite --to-sqlite ./data/tomorrowos.db
  tomorrowos migrate --from postgres --from-database-url "$OLD_DATABASE_URL" --to postgres --to-database-url "$NEW_DATABASE_URL"

Notes:
  - Migrates pairing/device/playlist/assignment database records.
  - Does not copy media files from public/uploads or object storage.
  - Target records with the same primary keys are overwritten/updated.
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    printHelp();
    return;
  }

  const cmd = argv[0];
  const rest = argv.slice(1);

  if (cmd === "init") {
    const force = rest.includes("--force");
    const pos = rest.filter((a) => !a.startsWith("-") && a !== "--force");
    let hosting: StarterHosting = "replit";
    try {
      hosting = parseHostingFlag(rest);
    } catch (err) {
      console.error("[tomorrowos]", err instanceof Error ? err.message : err);
      process.exit(1);
    }
    const filteredPos = pos.filter((a) => {
      const idx = rest.indexOf(a);
      const prev = rest[idx - 1];
      return prev !== "--hosting";
    });
    const target = filteredPos[0] ?? "my-tomorrowos-cms";
    copyStarter(target, force, hosting);
    return;
  }

  if (cmd === "build") {
    cmdBuild(rest);
    return;
  }

  if (cmd === "migrate") {
    await cmdMigrate(rest);
    return;
  }

  console.error(`[tomorrowos] Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error("[tomorrowos]", err instanceof Error ? err.message : err);
  process.exit(1);
});
