// The proxy in front of each client demo app (demos/aim, demos/football, demos/criteria), so the
// portfolio can frame it: /healthz and /start for the portfolio's frame (components/living/AppFrame.tsx),
// some paths closed, and everything else passed to the app, with the app's own refusal to be
// framed (X-Frame-Options, frame-ancestors) replaced by the portfolio's origins only.
import { createServer, request } from "node:http";

/**
 * @param {object} options
 * @param {number} options.port            where the proxy listens
 * @param {number} options.appPort         where the app listens, on 127.0.0.1
 * @param {string} options.source          the `source` on /start's message, as the portfolio expects
 * @param {string} options.frameAncestors  origins allowed to frame the demo ('none' when unset)
 * @param {string} [options.healthPath]    the app's path that answers 200 when it is up
 * @param {RegExp} [options.closed]        paths answered 404 with closedMessage
 * @param {string} [options.closedMessage]
 * @param {string} options.name            for the log line
 */
export function startFrameProxy({ port, appPort, source, frameAncestors, healthPath = "/", closed, closedMessage = "Not part of this demo.", name }) {
  const ancestors = frameAncestors?.trim() || "'none'";
  const startScript = `parent !== window && parent.postMessage({ source: '${source}', type: 'ready' }, '*'); location.replace('/');`;
  const startPage = `<!doctype html><meta charset="utf-8"><title>Opening</title><script>${startScript}</script>`;
  const own = { "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow", "content-security-policy": `frame-ancestors ${ancestors}` };

  createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/healthz") {
      // Healthy only when the app itself answers.
      const probe = request({ host: "127.0.0.1", port: appPort, path: healthPath, method: "GET" }, (r) => {
        r.resume();
        res.writeHead(r.statusCode && r.statusCode < 500 ? 200 : 503, { ...own, "content-type": "application/json", "access-control-allow-origin": "*" }).end('{"ok":true}');
      });
      probe.on("error", () => res.writeHead(503, { ...own, "access-control-allow-origin": "*" }).end());
      probe.end();
      return;
    }
    if (path === "/start") {
      res.writeHead(200, { ...own, "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": `default-src 'none'; script-src 'unsafe-inline'; frame-ancestors ${ancestors}` }).end(startPage);
      return;
    }
    if (closed?.test(path)) {
      res.writeHead(404, { ...own, "content-type": "text/plain; charset=utf-8" }).end(closedMessage);
      return;
    }
    const upstream = request({ host: "127.0.0.1", port: appPort, path: req.url, method: req.method, headers: req.headers }, (r) => {
      const headers = { ...r.headers, "x-robots-tag": "noindex, nofollow" };
      delete headers["x-frame-options"];
      delete headers["strict-transport-security"];
      const csp = headers["content-security-policy"];
      headers["content-security-policy"] = csp
        ? /frame-ancestors/.test(String(csp))
          ? String(csp).replace(/frame-ancestors [^;]*/, `frame-ancestors ${ancestors}`)
          : `${csp}; frame-ancestors ${ancestors}`
        : `frame-ancestors ${ancestors}`;
      res.writeHead(r.statusCode ?? 502, headers);
      r.pipe(res);
    });
    upstream.on("error", () => res.headersSent || res.writeHead(502, own).end("The demo is starting. Try again in a moment."));
    req.pipe(upstream);
  }).listen(port, () => console.log(`${name} demo on http://localhost:${port} (app on ${appPort})`));
}
