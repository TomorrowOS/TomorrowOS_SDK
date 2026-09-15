/**
 * Optional Control Panel auth for CMS starters.
 *
 * - CMS_PASSWORD unset → admin UI stays open (dev mode).
 * - CMS_PASSWORD set → browser admin requires login; device paths stay public.
 *
 * Device-safe (always open): WebSocket upgrades (not handled here),
 * GET /brand.json, GET /devices, GET /status, GET/HEAD /uploads/*.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { IncomingMessage, Server, ServerResponse } from "http";

const COOKIE_NAME = "tomorrowos_panel";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getCmsPassword(): string {
  return String(process.env.CMS_PASSWORD || "").trim();
}

export function isCmsAuthEnabled(): boolean {
  return getCmsPassword().length > 0;
}

export function isDevicePublicPath(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD") return false;
  if (pathname === "/brand.json") return true;
  if (pathname === "/devices") return true;
  if (pathname === "/status") return true;
  if (pathname === "/uploads" || pathname.startsWith("/uploads/")) return true;
  return false;
}

function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function signSession(password: string, exp: number): string {
  const payload = `exp=${exp}`;
  const sig = createHmac("sha256", password).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySession(password: string, token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = createHmac("sha256", password).update(payload).digest("base64url");
  if (!safeEqualString(sig, expected)) return false;
  const expMatch = /^exp=(\d+)$/.exec(payload);
  if (!expMatch) return false;
  const exp = Number(expMatch[1]);
  return Number.isFinite(exp) && Date.now() <= exp;
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function wantsHtml(req: IncomingMessage): boolean {
  const accept = String(req.headers.accept || "");
  if (accept.includes("application/json") && !accept.includes("text/html")) {
    return false;
  }
  if (accept.includes("text/html")) return true;
  if (!accept || accept.includes("*/*")) return true;
  return false;
}

function isHttpsRequest(req: IncomingMessage): boolean {
  const xf = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (xf === "https") return true;
  return Boolean((req.socket as { encrypted?: boolean }).encrypted);
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function loginPageHtml(error?: string): string {
  const err = error
    ? `<p style="color:#b91c1c;margin:0 0 1rem;font-size:0.95rem">${escapeHtml(error)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TomorrowOS Control Panel — Login</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f4f4f5; margin: 0; min-height: 100vh; display: grid; place-items: center; }
    .card { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 2rem; width: min(420px, 92vw); box-shadow: 0 8px 24px rgba(0,0,0,.04); }
    h1 { font-size: 1.25rem; margin: 0 0 .35rem; }
    p.hint { color: #71717a; font-size: .9rem; margin: 0 0 1.25rem; line-height: 1.4; }
    label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: .4rem; }
    input[type=password] { width: 100%; box-sizing: border-box; padding: .7rem .8rem; border: 1px solid #d4d4d8; border-radius: 8px; font-size: 1rem; }
    button { margin-top: 1rem; width: 100%; padding: .75rem 1rem; border: 0; border-radius: 8px; background: #111; color: #fff; font-weight: 600; cursor: pointer; }
    button:hover { background: #27272a; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="/login" autocomplete="current-password">
    <h1>CMS login</h1>
    <p class="hint">Enter your CMS password to login. Players do not use this password.</p>
    ${err}
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required autofocus />
    <button type="submit">Sign in</button>
  </form>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseFormPassword(raw: string, contentType: string | undefined): string {
  if ((contentType || "").includes("application/json")) {
    try {
      const data = JSON.parse(raw) as { password?: unknown };
      return String(data.password || "");
    } catch {
      return "";
    }
  }
  const params = new URLSearchParams(raw);
  return String(params.get("password") || "");
}

function setSessionCookie(res: ServerResponse, token: string, secure: boolean) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const securePart = secure ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${securePart}`
  );
}

function clearSessionCookie(res: ServerResponse, secure: boolean) {
  const securePart = secure ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${securePart}`
  );
}

/**
 * Returns true if the request was fully handled (caller must not forward to SDK).
 * Returns false if the request should continue to TomorrowOS HTTP handling.
 */
export async function handleCmsAuth(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (!isCmsAuthEnabled()) return false;

  const password = getCmsPassword();
  const method = String(req.method || "GET").toUpperCase();
  const url = new URL(req.url || "/", "http://localhost");
  let pathname = url.pathname || "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  if (isDevicePublicPath(method, pathname)) return false;

  if ((method === "GET" || method === "HEAD") && pathname === "/login") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    if (method === "HEAD") {
      res.end();
    } else {
      res.end(loginPageHtml());
    }
    return true;
  }

  if (method === "POST" && pathname === "/logout") {
    clearSessionCookie(res, isHttpsRequest(req));
    res.writeHead(303, { Location: "/login" });
    res.end();
    return true;
  }

  if (method === "POST" && pathname === "/login") {
    const raw = await readBody(req);
    const submitted = parseFormPassword(raw, req.headers["content-type"]);
    if (!safeEqualString(submitted, password)) {
      res.writeHead(401, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(loginPageHtml("Incorrect password."));
      return true;
    }
    const token = signSession(password, Date.now() + SESSION_TTL_MS);
    setSessionCookie(res, token, isHttpsRequest(req));
    const acceptJson =
      String(req.headers.accept || "").includes("application/json") ||
      String(req.headers["content-type"] || "").includes("application/json");
    if (acceptJson) {
      sendJson(res, 200, { status: "success" });
      return true;
    }
    res.writeHead(303, { Location: "/" });
    res.end();
    return true;
  }

  const cookies = parseCookies(req);
  if (verifySession(password, cookies[COOKIE_NAME])) return false;

  // Serve login with HTTP 200 (no 303). Replit Publish readiness probes `/` and
  // fails if it follows a redirect chain to /login.
  if (wantsHtml(req) && (method === "GET" || method === "HEAD")) {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    if (method === "HEAD") {
      res.end();
    } else {
      res.end(loginPageHtml());
    }
    return true;
  }

  sendJson(res, 401, {
    status: "failed",
    error:
      "CMS authentication required. Sign in at /login or set cookie after POST /login."
  });
  return true;
}

/** Wrap an http.Server created by TomorrowOS.listen so panel routes can require CMS_PASSWORD. */
export function attachCmsAuth(server: Server): void {
  const sdkRequestListeners = server.listeners("request").slice() as Array<
    (req: IncomingMessage, res: ServerResponse) => void
  >;
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    void (async () => {
      try {
        if (await handleCmsAuth(req, res)) return;
        for (const listener of sdkRequestListeners) {
          listener.call(server, req, res);
        }
      } catch (err) {
        console.error("[TomorrowOS] cms auth / request failed:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ status: "failed", error: "Internal server error" }));
        }
      }
    })();
  });

  if (isCmsAuthEnabled()) {
    console.log("[TomorrowOS] CMS_PASSWORD is set — Control Panel requires /login");
    console.log(
      "[TomorrowOS] Device paths remain open: WebSocket, /brand.json, /devices, /uploads/*"
    );
  } else {
    console.log("[TomorrowOS] CMS_PASSWORD unset — Control Panel is open (dev mode)");
  }
}
