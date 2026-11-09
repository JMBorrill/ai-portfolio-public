// Converts build.py's PNGs to WebP for the site, makes the card's 2019 | 2024 image, and copies the figures.
//   node demos/satellite/publish.mjs <build.py output> <public image dir> <content json>
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const [work, images, json] = process.argv.slice(2);
if (!json) throw new Error("usage: node demos/satellite/publish.mjs <work> <images> <json>");
const { sites } = JSON.parse(await readFile(join(work, "satellite.json"), "utf8"));
await mkdir(images, { recursive: true });

for (const site of sites) {
  for (const year of site.years) {
    // High quality: the 20 m pixels are drawn as sharp squares and should stay so.
    await sharp(join(work, `${year.image}.png`)).webp({ quality: 90, smartSubsample: true }).toFile(join(images, `${year.image}.webp`));
  }
}

// The card: the first site, both years side by side.
const [first] = sites;
const side = 768;
const gap = 64;
const panels = await Promise.all(
  first.years.map((year) => sharp(join(work, `${year.image}.png`)).resize(side, side, { kernel: "lanczos3" }).toBuffer()),
);
await sharp({ create: { width: 2 * side + gap, height: side, channels: 3, background: "#0f0f12" } })
  .composite(panels.map((input, i) => ({ input, left: i * (side + gap), top: 0 })))
  .webp({ quality: 88 })
  .toFile(join(images, "card-1600.webp"));

await copyFile(join(work, "satellite.json"), json);
console.log(`Published ${sites.length} sites to ${images} and ${json}`);
