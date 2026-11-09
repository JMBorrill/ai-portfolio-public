// Checks the static export in out/: internal links and anchors resolve, images carry alt text and
// dimensions, each page has one h1, and no internal evidence references reach the public build.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = "out";
const failures = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function fileForUrl(pathname) {
  const path = join(root, decodeURIComponent(pathname));
  if (pathname.endsWith("/")) return join(path, "index.html");
  return path;
}

function idsIn(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

if (!existsSync(root)) {
  console.error("No out/ directory. Run `npm run build` first.");
  process.exit(1);
}

const files = walk(root);
const pages = files.filter((f) => f.endsWith(".html"));
const external = new Set();

for (const page of pages) {
  const name = relative(root, page);
  const html = readFileSync(page, "utf8");
  const ids = idsIn(html);

  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) failures.push(`${name}: expected one <h1>, found ${h1s}`);

  for (const [, tag] of html.matchAll(/<img\b([^>]*)>/g)) {
    if (!/\salt="[^"]+"/.test(tag)) failures.push(`${name}: image without alt text: ${tag.slice(0, 80)}`);
    if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) failures.push(`${name}: image without dimensions`);
  }

  for (const [, attr, value] of html.matchAll(/\s(href|src|srcSet|srcset)="([^"]+)"/g)) {
    const urls = attr.toLowerCase() === "srcset" ? value.split(",").map((s) => s.trim().split(/\s+/)[0]) : [value];
    for (const url of urls) {
      if (/^(https?:)?\/\//.test(url)) {
        external.add(url);
        continue;
      }
      if (/^(mailto|tel|data):/.test(url)) continue;
      const [pathWithQuery, hash] = url.split("#");
      const pathname = pathWithQuery.split("?")[0];
      if (pathname === "") {
        if (hash && !ids.has(hash)) failures.push(`${name}: missing anchor #${hash}`);
        continue;
      }
      if (!pathname.startsWith("/")) {
        failures.push(`${name}: relative URL ${url}`);
        continue;
      }
      const target = fileForUrl(pathname);
      if (!existsSync(target)) {
        failures.push(`${name}: broken link ${url}`);
        continue;
      }
      if (hash && target.endsWith(".html") && !idsIn(readFileSync(target, "utf8")).has(hash)) {
        failures.push(`${name}: missing anchor ${url}`);
      }
    }
  }
}

for (const file of files.filter((f) => /\.(html|js|txt|json|css)$/.test(f))) {
  const text = readFileSync(file, "utf8");
  for (const leak of ["references/", "evidence.md", "publicRepositoryUrl"]) {
    if (text.includes(leak)) failures.push(`${relative(root, file)}: contains internal reference "${leak}"`);
  }
}

console.log(`Checked ${pages.length} pages and ${files.length} files.`);
console.log(`External URLs: ${external.size ? [...external].join(", ") : "none"}`);
if (failures.length) {
  console.error(failures.map((f) => `FAIL ${f}`).join("\n"));
  process.exit(1);
}
console.log("PASS: links, anchors, image alt text and dimensions, single h1, no internal evidence references.");
