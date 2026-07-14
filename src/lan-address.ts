import os from "os";

/** Prefer common private LAN ranges for local CMS / player media base URLs. */
function scoreLanIpv4(ip: string): number {
  if (ip.startsWith("192.168.")) return 3;
  if (ip.startsWith("10.")) return 2;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 2;
  return 1;
}

/**
 * Best-effort primary non-loopback IPv4 for local development.
 * Returns null when no suitable interface is found.
 */
export function detectPrimaryLanIpv4(): string | null {
  const nets = os.networkInterfaces();
  const addresses: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const ent of entries) {
      const family = ent.family as string | number;
      const isV4 = family === "IPv4" || family === 4;
      if (!isV4 || ent.internal) continue;
      addresses.push(ent.address);
    }
  }
  addresses.sort((a, b) => scoreLanIpv4(b) - scoreLanIpv4(a));
  return addresses[0] ?? null;
}
