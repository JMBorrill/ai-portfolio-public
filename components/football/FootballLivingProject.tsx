"use client";

import { media } from "@/content/media";
import { AppFrame } from "@/components/living/AppFrame";
import { LivingProject } from "@/components/living/LivingProject";

const MODE = "Anonymised demonstration build with fictional schools. Data resets every hour; passwords and accounts are locked.";
// Read here, by name, so the build can inline it.
const SITE_URL = process.env.NEXT_PUBLIC_FOOTBALL_SITE_URL ?? "";

function Workspace({ resets }: { resets: number }) {
  return <AppFrame url={SITE_URL} name="the schools football platform" source="football-site" resets={resets} />;
}

const preview = (
  <div className="living-preview">
    <div className="living-preview__shot">
      <img
        src={media.footballHome.src}
        srcSet={media.footballHome.srcSet}
        sizes="(min-width: 920px) 880px, 100vw"
        width={media.footballHome.width}
        height={media.footballHome.height}
        alt={media.footballHome.alt}
      />
    </div>
    <div className="living-preview__body">
      <p className="living-preview__lede">
        The workspace is the platform itself, from the project’s pinned commit, running on its own database filled with
        the app’s fictional schools, fixtures and results.
      </p>
      <ul className="living-preview__features">
        <li>
          <strong>Browse as the public.</strong> Fixtures, results, league tables and cup draws for boys’ and girls’
          competitions, no sign-in needed.
        </li>
        <li>
          <strong>Submit a result as a school.</strong> Sign in with <code>ashworthmoor@example.org</code> and{" "}
          <code>School-Demo-2026</code>, submit a score, and see how a disagreement between the two schools is flagged
          for the league.
        </li>
        <li>
          <strong>Run the league.</strong> Sign in as the chairman with <code>chairman@example.org</code> and{" "}
          <code>Chairman-Demo-2026</code> to approve results, manage fixtures and competitions, and watch the tables
          update.
        </li>
      </ul>
      <p>
        <strong>A shared demo.</strong> Everyone uses the same accounts, so the data returns to its starting state every
        hour. Passwords, user accounts, settings and imports are locked.
      </p>
      <p className="living-preview__caption">{media.footballHome.caption}</p>
    </div>
  </div>
);

export function FootballLivingProject() {
  return <LivingProject slug="schools-football" title="Schools League Platform" modeLabel={MODE} preview={preview} Workspace={Workspace} />;
}
