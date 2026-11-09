"use client";

import { media } from "@/content/media";
import { AppFrame } from "@/components/living/AppFrame";
import { LivingProject } from "@/components/living/LivingProject";

const MODE = "Fictional lenders, approved for demo use. Questions are read by keyword: no AI model is called.";
// Read here, by name, so the build can inline it.
const SITE_URL = process.env.NEXT_PUBLIC_CRITERIA_SITE_URL ?? "";

function Workspace({ resets }: { resets: number }) {
  return <AppFrame url={SITE_URL} name="Criteria Chat" source="criteria-site" resets={resets} />;
}

const preview = (
  <div className="living-preview">
    <div className="living-preview__shot">
      <img
        src={media.criteriaAnswer.src}
        srcSet={media.criteriaAnswer.srcSet}
        sizes="(min-width: 920px) 880px, 100vw"
        width={media.criteriaAnswer.width}
        height={media.criteriaAnswer.height}
        alt={media.criteriaAnswer.alt}
      />
    </div>
    <div className="living-preview__body">
      <p className="living-preview__lede">
        The workspace is Criteria Chat itself, from the project’s pinned commit, researching the criteria of three fictional
        lenders.
      </p>
      <ul className="living-preview__features">
        <li>
          <strong>Ask in your own words.</strong> About one lender, a few products or the whole panel, such as “Compare
          CCJ policy for Northgate Core and Kestrel Flex”.
        </li>
        <li>
          <strong>Every answer is quoted.</strong> Each statement is the lender’s own wording, with its guide and a link
          to the source. A policy that depends on conditions says so, and a missing one is never shown as a decline.
        </li>
        <li>
          <strong>Add case facts.</strong> Client details are entered separately and sent with the question, never
          guessed from it.
        </li>
      </ul>
      <p>
        <strong>Approved before it answers.</strong> The app withholds every answer unless a reviewer has approved the
        dataset’s exact contents; this one was reviewed and approved on 8 November 2026. Any change to the data
        withdraws it.
      </p>
      <p className="living-preview__caption">{media.criteriaAnswer.caption}</p>
    </div>
  </div>
);

export function CriteriaLivingProject() {
  return <LivingProject slug="criteria-chat" title="Criteria Chat" modeLabel={MODE} preview={preview} Workspace={Workspace} />;
}
