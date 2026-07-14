import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** Installed `@tomorrowos/sdk` package version (from this package's package.json). */
export function getSdkPackageVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    return String(pkg.version || "").trim() || "unknown";
  } catch {
    return "unknown";
  }
}
