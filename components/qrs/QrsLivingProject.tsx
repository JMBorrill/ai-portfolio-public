"use client";

import { media } from "@/content/media";
import { AppFrame } from "@/components/living/AppFrame";
import { LivingProject } from "@/components/living/LivingProject";

const CASE_STUDY = "/projects/quant-research-studio/";
const MODE = "Synthetic data (seed 42): not market prices or investment performance. Backtests run in the platform’s own engine.";
// Below this width (app/globals.css, .living__narrow) the studio's side panels cover its canvas, so
// a node cannot be selected to edit it. That is the application's own layout, left unmodified.
const NARROW = "On a screen this narrow, editing needs a wider one; running, results and export work.";
// Read here, by name, so the build can inline it.
const STUDIO_URL = process.env.NEXT_PUBLIC_QRS_STUDIO_URL ?? "";

function Workspace({ resets }: { resets: number }) {
  return <AppFrame url={STUDIO_URL} name="Backtesting Platform" source="qrs-studio" resets={resets} caseStudyHref={CASE_STUDY} />;
}

const preview = (
  <div className="living-preview">
    <div className="living-preview__shot">
      <img
        src={media.qrsWorkspace.src}
        srcSet={media.qrsWorkspace.srcSet}
        sizes="(min-width: 920px) 880px, 100vw"
        width={media.qrsWorkspace.width}
        height={media.qrsWorkspace.height}
        alt={media.qrsWorkspace.alt}
      />
    </div>
    <div className="living-preview__body">
      <p className="living-preview__notice living__narrow">
        <strong>On a phone or another narrow screen</strong>, the platform’s panels cover its canvas, so a
        strategy’s nodes cannot be selected for editing. Running the backtest, reading its results and exporting it all
        work. To edit, open the workspace on a screen at least 760 pixels wide, such as a tablet or a computer.
      </p>
      <p className="living-preview__lede">
        The workspace is the backtesting platform itself, opened at an EMA crossover strategy on a synthetic dataset. It is the
        real editor, compiler and backtest engine from the project’s pinned commit, running in a workspace of your own.
      </p>
      <ul className="living-preview__features">
        <li>
          <strong>Edit.</strong> Select a node and change its parameters, such as an EMA period. Every edit is validated,
          compiled to Python and saved as a new revision.
        </li>
        <li>
          <strong>Run.</strong> Choose <em>Run</em>. The compiled strategy is backtested with NautilusTrader in a worker
          process; each run records its code and result hashes.
        </li>
        <li>
          <strong>Inspect and export.</strong> Read the metrics, equity, fills and log, then export the strategy as a
          standalone Python bundle that reproduces the same result.
        </li>
      </ul>
      <p>
        <strong>Synthetic, not market data.</strong> The only dataset is 500 sessions generated with seed 42; results
        describe that data, not trading performance. New strategies, experiments, comparisons, research projects and data
        import are switched off here. Your workspace lasts for your visit; Reset starts a fresh one.
      </p>
      <p className="living-preview__caption">{media.qrsWorkspace.caption}</p>
      <p>
        <a href={CASE_STUDY}>Read the case study</a>
      </p>
    </div>
  </div>
);

export function QrsLivingProject() {
  return <LivingProject slug="quant-research-studio" title="Backtesting Platform" modeLabel={MODE} narrowNote={NARROW} preview={preview} Workspace={Workspace} />;
}
