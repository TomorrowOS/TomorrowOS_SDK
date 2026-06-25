import fs from "fs/promises";
import path from "path";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"]);

function isImageFilename(name: string): boolean {
  return IMAGE_EXT.has(path.extname(name).toLowerCase());
}

function scoreLogoCandidate(name: string): number {
  const base = path.basename(name, path.extname(name)).toLowerCase();
  if (base === "logo") return 100;
  if (base === "brand" || base === "brand-logo") return 90;
  if (base === "icon" || base === "favicon") return 80;
  if (base.includes("logo")) return 70;
  if (base.includes("brand")) return 60;
  if (base.includes("icon")) return 50;
  return 10;
}

function pickBestLogoFile(files: string[]): string | null {
  const images = files.filter(isImageFilename);
  if (images.length === 0) return null;
  images.sort((a, b) => {
    const diff = scoreLogoCandidate(b) - scoreLogoCandidate(a);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
  return images[0];
}

/** Copy project-root `assets/` into `staticRoot/assets/` when files are missing (common init layout). */
export async function syncProjectAssetsToStaticRoot(
  staticRoot: string
): Promise<void> {
  const resolvedRoot = path.resolve(staticRoot);
  const publicAssets = path.join(resolvedRoot, "assets");
  const projectAssets = path.join(path.dirname(resolvedRoot), "assets");

  await fs.mkdir(publicAssets, { recursive: true });

  let names: string[] = [];
  try {
    names = await fs.readdir(projectAssets);
  } catch {
    return;
  }

  for (const name of names) {
    if (!isImageFilename(name)) continue;
    const src = path.join(projectAssets, name);
    const dest = path.join(publicAssets, name);
    try {
      await fs.access(dest);
      continue;
    } catch {
      try {
        await fs.copyFile(src, dest);
        console.log(`[TomorrowOS] synced brand asset: assets/${name} → public/assets/${name}`);
      } catch (err) {
        console.warn(`[TomorrowOS] could not sync assets/${name}:`, err);
      }
    }
  }
}

/**
 * Resolve logoPath for players: honor brand.json when the file exists, otherwise
 * pick the best image under `staticRoot/assets/` (any filename).
 */
export async function resolveBrandLogoPath(
  staticRoot: string,
  configuredPath: unknown
): Promise<string | undefined> {
  const resolvedRoot = path.resolve(staticRoot);
  const assetsDir = path.join(resolvedRoot, "assets");

  await fs.mkdir(assetsDir, { recursive: true });

  const configured =
    typeof configuredPath === "string" && configuredPath.trim()
      ? configuredPath.trim()
      : "";

  if (configured) {
    const rel = configured.replace(/^\.\//, "").replace(/^[\\/]+/, "");
    const onDisk = path.join(resolvedRoot, rel);
    try {
      const st = await fs.stat(onDisk);
      if (st.isFile()) {
        return rel.startsWith("assets/") ? `./${rel}` : `./assets/${path.basename(rel)}`;
      }
    } catch {
      /* fall through to auto-detect */
    }
  }

  let files: string[] = [];
  try {
    files = await fs.readdir(assetsDir);
  } catch {
    return configured || undefined;
  }

  const picked = pickBestLogoFile(files);
  if (!picked) return configured || undefined;

  return `./assets/${picked}`;
}
