// Shared by the anonymised client demos (demos/aim, demos/football): rewrite a copy of a project's
// source, rename its identifying paths, replace its images, and check a build for anything missed.
// Each demo supplies its own replacements and forbidden terms; nothing here touches the original repository.
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

export async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

export const apply = (text, replacements) => replacements.reduce((t, [pattern, value]) => t.replace(pattern, value), text);

/** Applies the replacements to every text file under the given directories of root. Returns the number changed. */
export async function rewrite(root, dirs, replacements, text = /\.(tsx?|mts|cts|mjs|cjs|css|json|md|sql|prisma)$/) {
  let changed = 0;
  for (const dir of dirs) {
    for await (const path of walk(join(root, dir))) {
      if (!text.test(path)) continue;
      const before = await readFile(path, "utf8");
      const after = apply(before, replacements);
      if (after !== before) {
        await writeFile(path, after);
        changed++;
      }
    }
  }
  return changed;
}

/** Renames every file and directory under root whose own name matches, deepest first. Returns the number renamed. */
export async function renamePaths(root, pattern, renameName) {
  const targets = new Set();
  for await (const path of walk(root)) {
    let p = path;
    while (p.length > root.length) {
      if (pattern.test(p.slice(p.lastIndexOf("/") + 1))) targets.add(p);
      p = p.slice(0, p.lastIndexOf("/"));
    }
  }
  for (const from of [...targets].sort((a, b) => b.length - a.length)) {
    const dir = from.slice(0, from.lastIndexOf("/"));
    await rename(from, join(dir, renameName(from.slice(from.lastIndexOf("/") + 1))));
  }
  return targets.size;
}

/** Redraws an image at its own size and format from SVG markup: draw(width, height) returns the SVG body. */
export async function replaceImage(path, draw) {
  const { width, height, format } = await sharp(path).metadata();
  await rm(path);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${draw(width, height)}</svg>`);
  await sharp(svg)[format === "png" ? "png" : "jpeg"]().toFile(path);
}

export const FONT = "font-family='Helvetica, Arial, sans-serif'";

/** Exits non-zero if any forbidden term appears in a path or text file under out (node_modules aside). */
export async function check(out, forbidden) {
  const leaks = [];
  for await (const path of walk(out)) {
    if (/node_modules/.test(path)) continue;
    const name = path.slice(out.length);
    if (forbidden.test(name)) leaks.push(`${name} (path)`);
    if (!/\.(html|js|cjs|mjs|json|css|txt|rsc|body|meta|map|svg|xml|sql|prisma)$/.test(path)) continue;
    const match = (await readFile(path, "utf8")).match(forbidden);
    if (match) leaks.push(`${name}: ${match[0]}`);
  }
  if (leaks.length) {
    console.error(`FAIL: identifying text in the output:\n  ${leaks.slice(0, 20).join("\n  ")}`);
    process.exit(1);
  }
  console.log("PASS: no identifying text in the output.");
}
