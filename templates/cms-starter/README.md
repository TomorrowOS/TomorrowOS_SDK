# TomorrowOS CMS Starter

This starter runs a TomorrowOS CMS server with a small built-in control panel.
The entry point is `server.ts`.

## Start

```bash
npm install
npm run dev
```

By default, the starter uses SQLite at `data/tomorrowos.db`. The database is
created by `tomorrowos init` and the server will also create missing tables on
startup.

## Choose A Database

Use `.env` (or Replit Secrets) to select the database.

Default local SQLite:

```env
TOMORROWOS_STORE=sqlite
TOMORROWOS_DB_PATH=./data/tomorrowos.db
```

Supabase/Postgres:

```env
TOMORROWOS_STORE=supabase
SUPABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
DATABASE_SSL=true
# DATABASE_URL=...   # optional fallback; on Replit prefer SUPABASE_URL
```

On Replit, follow the package root file **`REPLIT_SETUP.md`** for a guided Agent
setup (screen count → SQLite vs Supabase → Cloudinary vs Object Storage → brand).

Throwaway in-memory store for tests only:

```env
TOMORROWOS_STORE=memory
```

The default `server.ts` uses `createTomorrowOSStore()`, so changing `.env` is
enough when you use the SDK's built-in SQLite or Supabase/Postgres schema.

## Migrate Data

Move data from SQLite to Supabase:

```bash
npx tomorrowos migrate \
  --from sqlite \
  --from-sqlite ./data/tomorrowos.db \
  --to supabase \
  --to-database-url "$DATABASE_URL"
```

Move data from Supabase back to SQLite:

```bash
npx tomorrowos migrate \
  --from supabase \
  --from-database-url "$DATABASE_URL" \
  --to sqlite \
  --to-sqlite ./data/tomorrowos.db
```

The migration command copies TomorrowOS database records: pairing codes, device
registry records, paired devices, playlists, and device assignments. It does not
copy media files in `public/uploads` or object storage. Copy those separately.

## Create Your Own Store

Use a custom store when you want your own table names, column names, or database
backend. Implement `TomorrowOSStore`; implement `TomorrowOSMigratableStore` too
if you want your custom store to participate in migrations.

Reference the SDK's built-in implementations for production-grade examples:

- `@tomorrowos/sdk/dist/store/sqlite-store.js`
- `@tomorrowos/sdk/dist/store/postgres-store.js`

In TypeScript projects or when working from the SDK source, the matching source
files are `src/store/sqlite-store.ts` and `src/store/postgres-store.ts`.

Example skeleton:

```ts
import type {
  DevicePlaylistAssignment,
  DeviceRegistryEntry,
  DeviceRegistryRecord,
  PairedDeviceEntry,
  PairedDeviceRecord,
  PendingCodeEntry,
  PendingCodeRecord,
  StoredPlaylist,
  TomorrowOSMigratableStore
} from "@tomorrowos/sdk";

export class MyDatabaseStore implements TomorrowOSMigratableStore {
  constructor(private readonly connectionString: string) {}

  async setPendingCode(code: string, record: PendingCodeRecord): Promise<void> {
    // Write record.deviceId and record.createdAt into your schema.
  }

  async getPendingCode(code: string): Promise<PendingCodeRecord | undefined> {
    // Read from your schema and map it back to { deviceId, createdAt }.
    return undefined;
  }

  async deletePendingCode(code: string): Promise<void> {}

  async listPendingCodes(): Promise<PendingCodeEntry[]> {
    return [];
  }

  async getDeviceRegistry(deviceId: string): Promise<DeviceRegistryRecord | undefined> {
    return undefined;
  }

  async setDeviceRegistry(deviceId: string, record: DeviceRegistryRecord): Promise<void> {}

  async getDeviceRegistryByCode(
    code: string
  ): Promise<{ deviceId: string; record: DeviceRegistryRecord } | undefined> {
    return undefined;
  }

  async listDeviceRegistry(): Promise<DeviceRegistryEntry[]> {
    return [];
  }

  async setPairedDevice(deviceId: string, record: PairedDeviceRecord): Promise<void> {}

  async getPairedDevice(deviceId: string): Promise<PairedDeviceRecord | undefined> {
    return undefined;
  }

  async deletePairedDevice(deviceId: string): Promise<void> {}

  async listPairedDevices(): Promise<PairedDeviceEntry[]> {
    return [];
  }

  async listPlaylists(): Promise<StoredPlaylist[]> {
    return [];
  }

  async getPlaylist(id: string): Promise<StoredPlaylist | undefined> {
    return undefined;
  }

  async setPlaylist(record: StoredPlaylist): Promise<void> {}

  async isPlaylistNameTaken(name: string, excludeId?: string): Promise<boolean> {
    return false;
  }

  async getDeviceAssignments(deviceId: string): Promise<DevicePlaylistAssignment[]> {
    return [];
  }

  async setDeviceAssignments(
    deviceId: string,
    assignments: DevicePlaylistAssignment[]
  ): Promise<void> {}
}
```

## Use Your Store In server.ts

Replace the default store creation:

```ts
const store = createTomorrowOSStore({
  sqlitePath: join(__dirname, "data", "tomorrowos.db")
});
```

with your custom store:

```ts
import { TomorrowOS } from "@tomorrowos/sdk";
import { MyDatabaseStore } from "./stores/my-database-store.js";

const store = new MyDatabaseStore(process.env.DATABASE_URL!);
const tomorrowos = new TomorrowOS({ brand, store });
```

Your store class name and file path can be anything. TomorrowOS only requires
that the object passed as `store` implements the required store methods.
