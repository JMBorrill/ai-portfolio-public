"use client";

import { media } from "@/content/media";
import { LivingProject } from "@/components/living/LivingProject";
import { SatelliteViewer } from "./SatelliteViewer";

const MODE = "Real Sentinel-2 imagery. Descriptive figures computed for this portfolio; no financial or production claim.";

const preview = (
  <div className="living-preview">
    <div className="living-preview__shot">
      <img
        src={media.satelliteCard.src}
        width={media.satelliteCard.width}
        height={media.satelliteCard.height}
        alt={media.satelliteCard.alt}
      />
    </div>
    <div className="living-preview__body">
      <p className="living-preview__lede">
        The lab asks what free satellite imagery can show about change at industrial sites. The workspace compares real
        Sentinel-2 images from 2019 and 2024, one investigation at a time.
      </p>
      <ul className="living-preview__features">
        <li>
          <strong>Four investigations.</strong> Construction, mining, ports and energy: each with its question,
          hypotheses and what imagery cannot show.
        </li>
        <li>
          <strong>Compare.</strong> A representative site in 2019 and 2024, with how much of the measured square ESA’s
          scene classification calls vegetation, bare ground or water.
        </li>
        <li>
          <strong>Check the limits.</strong> Each figure says how it was made and what it cannot tell you.
        </li>
      </ul>
      <p>
        <strong>Descriptive, not predictive.</strong> The lab’s financial research is blocked on a licensed price source,
        so nothing here is a market signal.
      </p>
      <p className="living-preview__caption">{media.satelliteCard.caption}</p>
    </div>
  </div>
);

export function SatelliteLivingProject() {
  return <LivingProject slug="satellite-intelligence-lab" title="Satellite Intelligence Lab" modeLabel={MODE} preview={preview} Workspace={SatelliteViewer} />;
}
