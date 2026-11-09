"""Builds the Satellite Intelligence Lab viewer's images and figures from the lab's downloaded imagery.

    <lab>/.venv/bin/python -I demos/satellite/build.py <lab> <wide-cache> <output-dir>

<lab> is a satellite-intelligence-lab checkout after `sil acquire` for each project. Its crops (four
bands: red, nir, swir16, scl; 128 x 128 pixels at 20 m, 2.56 km) give the figures. For context,
the same scenes are read again over a wider square with the lab's own window function, on the
same grid, into <wide-cache> (downloaded once; the lab's checkout is not written to). Writes,
per site and year, a false-colour PNG of the wide square, and descriptive figures for the lab's
square (outlined on the image) to <output-dir>/satellite.json.

These figures are made for the portfolio, not by the lab: its own `sil run` refuses these crops,
because their pixel checksums differ from the ones pinned on Linux (same products, grid and URLs;
see demos/satellite/README.md). Nothing here is a measurement of output or a financial signal.
"""

import json
import sys
from pathlib import Path

import numpy as np
import rasterio

SITES = [
    # (project, site id, registry name, what to look for)
    ("industrial", "tesla_texas", "Tesla Gigafactory Texas"),
    ("mining", "morenci", "Morenci mine"),
    ("ports", "la_pier400", "Los Angeles APM Pier 400"),
    ("energy", "bowen", "Plant Bowen"),
]
# ESA Sentinel-2 Scene Classification (SCL) classes.
SCL = {"vegetation": [4], "not_vegetated": [5], "water": [6], "cloud": [3, 8, 9, 10], "no_data": [0, 1]}
WIDE_RADIUS_M = 3000  # a 6 km square, against the lab's 2.56 km
SCALE = 2  # 300 px → 600 px, nearest neighbour: each 20 m pixel stays a sharp square.


def reflectance(dn, source):
    return dn.astype("float64") * source["scale"] + source["offset"]


def bands(tif: Path):
    manifest = json.loads(tif.with_suffix(".manifest.json").read_text())
    with rasterio.open(tif) as src:
        red_dn, nir_dn, swir_dn, scl = src.read()
    sources = manifest["sources"]
    red, nir, swir = (reflectance(a, sources[b]) for a, b in ((red_dn, "red"), (nir_dn, "nir"), (swir_dn, "swir16")))
    return manifest, red, nir, swir, scl


def false_colour(swir, nir, red):
    # Fixed stretch, the same for every image, so years and sites compare directly.
    stack = np.stack([swir, nir, red], axis=-1)
    scaled = np.clip(stack / 0.4, 0, 1) ** (1 / 1.6)
    return np.repeat(np.repeat((scaled * 255).round().astype("uint8"), SCALE, 0), SCALE, 1)


def figures(tif: Path):
    manifest, red, nir, _, scl = bands(tif)
    total = scl.size
    shares = {name: round(float(np.isin(scl, codes).sum()) / total, 4) for name, codes in SCL.items()}
    clear = np.isin(scl, SCL["vegetation"] + SCL["not_vegetated"] + SCL["water"])
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)
    return manifest, {
        "shares": shares,
        "mean_ndvi": round(float(np.nanmean(ndvi[clear])), 3) if clear.any() else None,
        "clear_share": round(float(clear.sum()) / total, 4),
    }


def wide(tif: Path, entry: dict, cache: Path) -> Path:
    """The same scene over the wide square, read once with the lab's own window function."""
    from sil.imagery import acquire_window  # the lab's code, installed in its environment

    path = cache / tif.name
    if not path.exists():
        item = json.loads(tif.with_suffix(".stac.json").read_text())
        acquire_window(item, entry["longitude"], entry["latitude"], cache, radius_m=WIDE_RADIUS_M)
    return path


def outline(inner: dict, outer: dict) -> dict:
    """Where the lab's square sits in the wide one, as fractions of its width and height."""
    (res, _, left, _, _, top), (_, _, wide_left, _, _, wide_top) = inner["transform"], outer["transform"]
    size = outer["shape"][1]
    return {"x": round((left - wide_left) / res / size, 4), "y": round((wide_top - top) / res / size, 4), "size": round(inner["shape"][1] / size, 4)}


def main(lab: Path, cache: Path, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    sites = []
    for project, site_id, name in SITES:
        registry = {s.get("id", s["name"]): s for s in json.loads((lab / "projects" / project / "site_registry.json").read_text())}
        entry = next(s for s in registry.values() if s["name"] == name)
        years = []
        for tif in sorted((lab / "data" / project / "imagery" / site_id).glob("*/*_L2A.tif")):
            manifest, numbers = figures(tif)
            wide_tif = wide(tif, entry, cache / site_id / tif.parent.name)
            wide_manifest, red, nir, swir, _ = bands(wide_tif)
            image = false_colour(swir, nir, red)
            png = out / f"{site_id}-{tif.parent.name}.png"
            height, width, _ = image.shape
            with rasterio.open(png, "w", driver="PNG", width=width, height=height, count=3, dtype="uint8") as dst:
                dst.write(np.moveaxis(image, -1, 0))
            years.append({
                "year": int(tif.parent.name),
                "observed": manifest["observed_at"][:10],
                "item": manifest["item_id"],
                "processing_baseline": manifest["processing_baseline"],
                "scene_cloud_percent": manifest["scene_cloud_percent"],
                "image": png.stem,
                "outline": outline(manifest, wide_manifest),
                **numbers,
            })
        sites.append({
            "id": site_id,
            "project": project,
            "name": name,
            "latitude": round(entry["latitude"], 4),
            "longitude": round(entry["longitude"], 4),
            "extent_km": 2.56,
            "wide_extent_km": 2 * WIDE_RADIUS_M / 1000,
            "resolution_m": 20,
            "years": years,
        })
    (out / "satellite.json").write_text(json.dumps({"sites": sites}, indent=1) + "\n")
    print(f"Wrote {sum(len(s['years']) for s in sites)} images for {len(sites)} sites to {out}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: build.py <satellite-intelligence-lab> <wide-cache> <output-dir>")
    main(*(Path(a).resolve() for a in sys.argv[1:]))
