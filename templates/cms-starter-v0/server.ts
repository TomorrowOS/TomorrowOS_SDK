/**
 * Local / non-Vercel entry (`npm start`, Preview internal port).
 * On Vercel Production the Function entry is `api/index.ts` (see vercel.json).
 */

export { server as default } from "./cms-app.js";
