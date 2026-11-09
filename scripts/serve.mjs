// Serves the static export in out/ on 127.0.0.1:4173 (PORT), for local preview and the browser tests.
//   npm run build && npm run serve        # then open http://localhost:4173
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const ROOT = normalize(join(import.meta.dirname, "..", "out"));
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

async function file(path) {
  const candidate = normalize(join(ROOT, decodeURIComponent(path)));
  if (!candidate.startsWith(ROOT)) return null;
  for (const option of [candidate, join(candidate, "index.html")]) {
    try {
      if ((await stat(option)).isFile()) return { body: await readFile(option), type: TYPES[extname(option)] ?? "application/octet-stream" };
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://site");
  const found = req.method === "GET" || req.method === "HEAD" ? await file(url.pathname) : null;
  if (found) {
    res.writeHead(200, { "content-type": found.type });
    return res.end(req.method === "HEAD" ? undefined : found.body);
  }
  const notFound = await file("/404.html");
  res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  res.end(notFound?.body ?? "Not found");
}).listen(PORT, "127.0.0.1", () => console.log(`site on http://localhost:${PORT}`));
