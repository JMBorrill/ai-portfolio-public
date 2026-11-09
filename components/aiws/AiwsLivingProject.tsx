"use client";

import { media } from "@/content/media";
import { LivingProject } from "@/components/living/LivingProject";
import { AppFrame } from "@/components/living/AppFrame";

const CASE_STUDY = "/projects/ai-workflow-studio/";
const MODE = "Fixture mode: recorded model and tool responses. No live AI is called and nothing is sent.";

// Read here, by name, so the build can inline it.
const STUDIO_URL = process.env.NEXT_PUBLIC_AIWS_STUDIO_URL ?? "";

function Workspace({ resets }: { resets: number }) {
  return <AppFrame url={STUDIO_URL} name="AI Workflow Studio" source="aiws-studio" resets={resets} caseStudyHref={CASE_STUDY} oneTabAtATime />;
}

const preview = (
  <div className="living-preview">
    <div className="living-preview__shot">
      <img
        src={media.aiwsWorkspace.src}
        srcSet={media.aiwsWorkspace.srcSet}
        sizes="(min-width: 920px) 880px, 100vw"
        width={media.aiwsWorkspace.width}
        height={media.aiwsWorkspace.height}
        alt={media.aiwsWorkspace.alt}
      />
    </div>
    <div className="living-preview__body">
      <p className="living-preview__lede">
        The workspace is AI Workflow Studio itself, opened at the JMB lead qualification workflow. It is the real editor
        and runtime from the project’s pinned commit, not a recreation.
      </p>
      <ul className="living-preview__features">
        <li>
          <strong>Test.</strong> Choose <em>Run with fixtures</em>. The run pauses at <em>Send this reply?</em> until you
          approve or reject the draft; then inspect each step’s input, output and trace.
        </li>
        <li>
          <strong>Design.</strong> Change a step, a condition or the enquiry. The studio validates and saves every edit.
        </li>
        <li>
          <strong>Export.</strong> Generate the standalone project; the exporter runs its fixture test before you download it.
        </li>
      </ul>
      <p>
        <strong>Recorded, not live.</strong> Fixture runs replay the model answers and tool responses stored with the
        workflow, so the fictional enquiry gets the same recorded draft each time. No model is called and no email is sent.
        Live runs, Python steps, ZIP import and saved credentials are switched off here. Your changes stay in this browser
        until you choose Reset, which restores the example; the workspace is open in one tab at a time.
      </p>
      <p className="living-preview__caption">{media.aiwsWorkspace.caption}</p>
      <p>
        <a href={CASE_STUDY}>Read the case study</a>
      </p>
    </div>
  </div>
);

export function AiwsLivingProject() {
  return <LivingProject slug="ai-workflow-studio" title="AI Workflow Studio" modeLabel={MODE} preview={preview} Workspace={Workspace} />;
}
