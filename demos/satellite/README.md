# Satellite Intelligence Lab viewer

The portfolio's **Satellite Intelligence Lab** workspace compares real Sentinel-2 imagery of four sites from 2019 and 2024. It is built into the site (`components/satellite/`): there is no demo service to run or host.

```
demos/satellite/build.sh ~/path/to/satellite-intelligence-lab
```

The lab checkout needs its environment (`.venv`, Python 3.12) and `sil acquire --project <p>` run for `mining`, `industrial`, `ports` and `energy`. The script writes `public/projects/satellite-intelligence-lab/*.webp` and `content/satellite.json`; both are committed, so the site builds without the lab.

- **Sections.** One per investigation (industrial, mining, ports, energy), with its question, hypotheses, candidate sites and limits, summarised from the lab's `projects/<p>/brief.md` at `d7a774e`, and its representative site.
- **Images.** For context, a 6 km square: the same scenes read again with the lab's own `acquire_window` (radius 3,000 m, same grid and centre) into `satellite-wide/` beside the lab, once. False colour (shortwave infrared, near infrared, red) with one fixed stretch for every image; each 20 m pixel is drawn 2 × 2 without smoothing.
- **Figures.** For the lab's own 2.56 km crop, outlined on each image: shares in ESA's Scene Classification classes, and the average NDVI over clear pixels. They are computed here, for the portfolio, and the page says so.
- **Descriptions.** The alt text and summaries in `components/satellite/SatelliteViewer.tsx` were written by looking at the images; they say what is visible, not why it changed. Rewrite them if the images change.
- **Why not the lab's own results.** On 8 November 2026, `sil acquire` on this Mac (macOS arm64, GDAL 3.12.2) downloaded the pinned items with identical item IDs, source URLs, processing baseline, reprocessing date and grid, but `sil run` rejected every crop: `pinned raster pixel_sha256 changed`. The pins were made on Linux x86-64. Resampling differences between the platforms' GDAL builds are the likely cause; this was not confirmed, as no Linux environment was available. Running the lab on Linux and checking the pins would allow its own verified outputs to replace these figures.
- **Limits stated on the page.** One scene per year, months apart, so season moves vegetation figures; squares centred on published reference points, not surveyed outlines; no claim about production, activity or the companies.
- **Attribution.** "Contains modified Copernicus Sentinel data 2019 and 2024", on the page and in the card caption.
