/**
 * Vercel Function entry (Fluid + WebSockets).
 * Mounted at `/api`. vercel.json rewrites `/` and `/status` etc. here so the
 * Control Panel and device `wss://` upgrades hit the same Node http.Server.
 *
 * Pattern: https://vercel.com/docs/functions/websockets
 *   const server = …; export default server;
 */

export { server as default } from "../cms-app.js";
