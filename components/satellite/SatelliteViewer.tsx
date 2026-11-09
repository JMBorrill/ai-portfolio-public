"use client";

import data from "@/content/satellite.json";

// The Satellite Intelligence Lab workspace: one section per investigation, each with its question
// (from the lab's project briefs) and its representative site's real Sentinel-2 imagery from 2019
// and 2024. The images show a 6 km square for context; the figures, computed for the portfolio by
// demos/satellite/build.py, are for the lab's own 2.56 km square, outlined on each image.
// Descriptions say only what the images show; they do not explain why anything changed.

const IMAGES = "/projects/satellite-intelligence-lab";

type Site = (typeof data.sites)[number];
type Year = Site["years"][number];

type Investigation = {
  project: string;
  title: string;
  question: string;
  hypotheses: string[];
  candidates: string;
  limits: string;
  summary: string;
  alt: Record<number, string>;
};

// Order: the investigation whose change is clearest first.
const INVESTIGATIONS: Investigation[] = [
  {
    project: "industrial",
    title: "Industrial construction",
    question:
      "Can moderate-resolution imagery detect large industrial construction, and improve dated estimates of a project’s progress?",
    hypotheses: [
      "Changes in large roof, paved and disturbed areas detect documented construction stages better than no-change and seasonal baselines.",
      "Lagged construction features improve estimates of commissioning or disclosed capacity beyond announcement dates.",
      "Stable neighbouring industrial land shows no systematic construction signal (negative control).",
    ],
    candidates: "Tesla Texas (shown), Intel Ocotillo and Tesla Nevada.",
    limits: "At 10–20 m, imagery resolves large roofs and site footprints, not vehicles or factory equipment, and says nothing on its own about output.",
    summary: "Farmland and scrub in 2019; by 2024 a very large building, car parks and cleared ground fill the outlined square, and a dark lake lies to the east where 2019 shows bare grey ground.",
    alt: {
      2019: "Mostly green farmland and scrub either side of a highway, with a winding river and an area of bare grey ground to the east.",
      2024: "The same area: a very large rectangular building with car parks and pale cleared ground fills the centre, and a dark lake lies to the east; green land remains to the west and along the river.",
    },
  },
  {
    project: "mining",
    title: "Mining",
    question:
      "Does observable surface change at a mine improve an independently measured operating forecast, and only then add financial information?",
    hypotheses: [
      "Quarter-end change in cloud-masked disturbed land, within fixed mine areas, improves next-quarter production prediction over seasonal persistence.",
      "A simple vegetation and bare-ground change baseline separates documented mine expansion from stable control areas.",
      "Surface change at Cigar Lake, an underground mine, has no stable relationship with extraction (negative control).",
    ],
    candidates: "Morenci, copper and molybdenum (shown); Cortez, gold; Cigar Lake, uranium.",
    limits: "A surface feature is not extracted tonnage or ore grade; weather, soil colour, reclamation and shadows all confound change.",
    summary: "Terraced open-pit ground in both years. The large pale-blue pond in the lower left of the outlined square in 2019 is pale and looks dry in 2024.",
    alt: {
      2019: "Pink and brown terraced ground of a large open-pit mine, with a pale-blue pond at the lower left of the centre and plant buildings to the lower right.",
      2024: "The same terraced ground; the pond at the lower left of the centre is pale and looks dry.",
    },
  },
  {
    project: "ports",
    title: "Ports",
    question: "Do cloud-screened changes in container-yard surfaces add information about later port throughput?",
    hypotheses: [
      "Monthly yard reflectance and texture changes improve one-month-ahead port throughput prediction over seasonal and lagged baselines.",
      "Expansion of paved yard areas predicts later disclosures of capacity development.",
    ],
    candidates: "Los Angeles Pier 400 (shown), Long Beach Pier J and Savannah Garden City.",
    limits: "Sentinel-2 cannot count individual containers, and whole-port monthly totals cannot validate a single terminal.",
    summary: "Port terminals either side of dark water in both years. The yard on the lower-right pier looks more densely covered in 2024.",
    alt: {
      2019: "Dark water between grey port terminals marked with rows of containers, a town to the west and a breakwater to the south.",
      2024: "The same terminals; the yard on the lower-right pier of the centre looks more densely covered.",
    },
  },
  {
    project: "energy",
    title: "Energy",
    question:
      "Can observable change at large coal power stations measure stockpile and land-use change, and improve later generation estimates?",
    hypotheses: [
      "Monthly coal-yard spectral and area changes improve next-month net-generation estimates over seasonal, autoregressive and weather-adjusted baselines.",
      "Persistent change in large infrastructure or ash-pond footprints predicts documented construction, retirement or environmental work.",
    ],
    candidates: "Plant Bowen (shown), Scherer and Roxboro, with plant-month generation from the EIA as ground truth.",
    limits: "Fuel purchasing, outages, weather and regulation may overwhelm any physical signal.",
    summary: "A power station among green fields in both years. In 2024 the ponds on its west side look smaller and grey, a dark rectangle appears to the upper right of the outlined square, and a pale area with a dark centre appears to the north-east.",
    alt: {
      2019: "A power station complex surrounded by green fields and a winding river, with dark ponds on its west side and a large dark pond north of the main buildings.",
      2024: "The same complex; the ponds on the west side look smaller and grey, a dark rectangle appears to the upper right, and a pale area with a dark centre to the north-east.",
    },
  },
];

const ROWS: { label: string; value: (y: Year) => number | null; percent?: boolean }[] = [
  { label: "Vegetation", value: (y) => y.shares.vegetation, percent: true },
  { label: "Bare ground or built-up", value: (y) => y.shares.not_vegetated, percent: true },
  { label: "Water", value: (y) => y.shares.water, percent: true },
  { label: "Cloud or cloud shadow", value: (y) => y.shares.cloud, percent: true },
  { label: "Average vegetation index (NDVI, clear pixels)", value: (y) => y.mean_ndvi },
];

const show = (value: number | null, percent?: boolean) =>
  value === null ? "–" : percent ? `${(value * 100).toFixed(1)}%` : value.toFixed(2);

function change(a: number | null, b: number | null, percent?: boolean) {
  if (a === null || b === null) return "–";
  const d = b - a;
  const text = percent ? `${(Math.abs(d) * 100).toFixed(1)} points` : Math.abs(d).toFixed(2);
  return Math.abs(d) < (percent ? 0.0005 : 0.005) ? "No change" : `${d > 0 ? "+" : "−"}${text}`;
}

const place = (site: Site) =>
  `${Math.abs(site.latitude)}° ${site.latitude >= 0 ? "N" : "S"}, ${Math.abs(site.longitude)}° ${site.longitude >= 0 ? "E" : "W"}`;

function InvestigationSection({ investigation, site }: { investigation: Investigation; site: Site }) {
  const [before, after] = site.years;
  const id = `sat-${investigation.project}`;
  return (
    <section className="sat__investigation" aria-labelledby={`${id}-title`} id={id}>
      <h3 id={`${id}-title`} className="sat__title">
        {investigation.title}
      </h3>
      <p className="sat__question">{investigation.question}</p>

      <div className="sat__brief">
        <div>
          <h4>Hypotheses</h4>
          <ol>
            {investigation.hypotheses.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
        </div>
        <dl>
          <dt>Sites</dt>
          <dd>{investigation.candidates}</dd>
          <dt>What imagery cannot show</dt>
          <dd>{investigation.limits}</dd>
          <dt>Status</dt>
          <dd>Preparation stage. The full research is blocked, chiefly on a licensed historical price source.</dd>
        </dl>
      </div>

      <h4 className="sat__site">{site.name}</h4>
      <p className="sat__where">
        {site.wide_extent_km} km square around {place(site)}. The outlined {site.extent_km} km square is the lab’s; the
        figures below are for it. Each pixel is {site.resolution_m} m across.
      </p>
      <div className="sat__pair">
        {[before, after].map((y) => (
          <figure key={y.year} className="sat__figure">
            <div className="sat__image">
              <img
                src={`${IMAGES}/${y.image}.webp`}
                width={600}
                height={600}
                loading="lazy"
                decoding="async"
                alt={`${site.name}, ${y.observed}: ${investigation.alt[y.year]}`}
              />
              <span
                className="sat__outline"
                aria-hidden="true"
                style={{ left: `${y.outline.x * 100}%`, top: `${y.outline.y * 100}%`, width: `${y.outline.size * 100}%`, height: `${y.outline.size * 100}%` }}
              />
            </div>
            <figcaption>
              <strong>{y.year}</strong> · {y.observed} · scene cloud {y.scene_cloud_percent.toFixed(1)}%
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="sat__summary">{investigation.summary}</p>

      <table className="sat__table">
        <caption>Share of the outlined square by ESA’s scene classification</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">{before.year}</th>
            <th scope="col">{after.year}</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{show(row.value(before), row.percent)}</td>
              <td>{show(row.value(after), row.percent)}</td>
              <td>{change(row.value(before), row.value(after), row.percent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function SatelliteViewer() {
  const sections = INVESTIGATIONS.map((investigation) => ({
    investigation,
    site: data.sites.find((s) => s.project === investigation.project)!,
  }));
  return (
    <div className="sat">
      <div className="sat__inner">
        <p className="sat__intro">
          Four separate investigations ask what free Sentinel-2 imagery can show about change at industrial sites. Each
          has its own question, preregistered hypotheses and negative controls, and each is shown here with a
          representative site in 2019 and 2024.
        </p>
        <nav aria-label="Investigations" className="sat__contents">
          {sections.map(({ investigation }) => (
            <a key={investigation.project} href={`#sat-${investigation.project}`} onClick={(e) => {
              // The page's hash holds the open project; scroll within the workspace instead.
              e.preventDefault();
              document.getElementById(`sat-${investigation.project}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}>
              {investigation.title}
            </a>
          ))}
        </nav>

        {sections.map(({ investigation, site }) => (
          <InvestigationSection key={investigation.project} investigation={investigation} site={site} />
        ))}

        <div className="sat__notes">
          <h3>Reading the images</h3>
          <p>
            False colour: shortwave infrared shows as red, near infrared as green and red light as blue. Growing
            vegetation is bright green, bare ground and buildings are pink, brown or white, and water is near black.
            Every image uses the same colour scale.
          </p>
          <h3>Method and limits</h3>
          <ul>
            <li>
              Each image is a crop of a Sentinel-2 Level-2A scene, read with the lab’s own acquisition code and resampled
              to 20 m pixels. The shares count pixels in ESA’s Scene Classification layer; the vegetation index is (near
              infrared − red) ÷ (near infrared + red), averaged over pixels that are not cloud or missing.
            </li>
            <li>
              These figures were computed for this portfolio, not by the lab. Its full pipeline holds them back because
              their pixel checksums differ from those it pinned on Linux, although the products, grid and source files
              are the same.
            </li>
            <li>
              One scene per year, often months apart (June against August), so season alone can move the vegetation
              figures. The squares are centred on published reference points, not surveyed outlines of each site.
            </li>
            <li>
              Nothing here measures production or activity, or says anything about the companies involved. The lab’s
              full research is blocked, and it makes no trading claim.
            </li>
          </ul>
          <p className="sat__credit">Contains modified Copernicus Sentinel data 2019 and 2024, via Element 84 Earth Search on AWS.</p>
        </div>
      </div>
    </div>
  );
}
