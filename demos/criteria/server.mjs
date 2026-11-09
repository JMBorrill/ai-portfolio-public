// Runs the Criteria Chat demo (built by build.sh) for the portfolio to frame.
//   CRITERIA_SITE=demos/criteria/site PORT=8777 CRITERIA_FRAME_ANCESTORS="http://localhost:3001" node demos/criteria/server.mjs
// The app (`criteria-chat serve`, offline keyword reader, no model) runs on PORT + 1 behind the shared
// proxy (demos/lib/frame-proxy.mjs). It serves policy answers only if release/runtime-approval.json
// holds the reviewer's approval of the dataset's exact digest; otherwise it withholds them all.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { startFrameProxy } from "../lib/frame-proxy.mjs";

const SITE = resolve(process.env.CRITERIA_SITE ?? join(import.meta.dirname, "site"));
const PORT = Number(process.env.PORT ?? 8777);
const APP_PORT = PORT + 1;
const approval = join(SITE, "release", "runtime-approval.json");

const app = spawn(
  join(SITE, "backend", ".venv", "bin", "criteria-chat"),
  ["serve", "--host", "127.0.0.1", "--port", String(APP_PORT), ...(existsSync(approval) ? ["--approval", approval] : [])],
  { cwd: join(SITE, "backend"), stdio: ["ignore", "inherit", "inherit"], env: { PATH: process.env.PATH } },
);
app.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => (app.kill(), process.exit(0)));
if (!existsSync(approval)) console.log("No runtime approval: every policy answer is withheld.");

startFrameProxy({
  port: PORT,
  appPort: APP_PORT,
  source: "criteria-site",
  frameAncestors: process.env.CRITERIA_FRAME_ANCESTORS,
  healthPath: "/api/status",
  name: "Criteria Chat",
});
