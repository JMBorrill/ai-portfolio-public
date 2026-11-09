import type { Metadata } from "next";
import { CaseStudyHeader, CodeExcerpt, LayerDiagram, NextProject, Section } from "@/components/CaseStudy";
import { Figure } from "@/components/Figure";
import { ExploreCallout } from "@/components/living/ExploreCallout";
import { media } from "@/content/media";
import { getProject } from "@/lib/projects";

const project = getProject("ai-workflow-studio");

export const metadata: Metadata = {
  title: project.title,
  description: project.highlight,
};

// Copied verbatim from the approval step of the lead qualification workflow.
const approvalStep = `"type": "approval",
"label": "Approve reply",
"config": {
  "title": "Send this reply?",
  "message": "{{input.name}} ({{input.company}}) scored {{steps.classify.output.score}}/100 ({{steps.classify.output.tier}}, {{steps.classify.output.intent}}).",
  "details": {
    "to": "{{input.email}}",
    "subject": "{{steps.draft.output.subject}}",
    "body": "{{steps.draft.output.body}}",
    "reasons": "{{steps.classify.output.reasons}}",
    "red_flags": "{{steps.classify.output.red_flags}}"
  }
}`;

const workflowSteps = [
  ["Website enquiry", "Webhook trigger with five validated input fields."],
  ["Classify and score", "Agent step: intent, a 0–100 fit score, tier, reasons and red flags."],
  ["Spam?", "Condition: spam ends the run as discarded."],
  ["Score at least 60?", "Condition: lower scores end as nurture, with no reply."],
  ["Draft reply", "Agent step: subject and body."],
  ["Approve reply", "Approval checkpoint: the run waits for a person."],
  ["Queue reply in outbox", "Tool call, retried up to twice, only after approval. A rejection ends the run as rejected."],
] as const;

export default function AiWorkflowStudioPage() {
  return (
    <article className="case">
      <CaseStudyHeader
        project={project}
        lede="A desktop studio for building agentic workflows: model steps, conditions and tools on one canvas, run by a shared runtime, with explicit points where a person decides what happens next."
      />

      <Figure media={media.aiwsWorkspace} priority sizes="(min-width: 1200px) 1120px, 100vw" className="case-hero container" />

      <ExploreCallout slug="ai-workflow-studio">
        Open AI Workflow Studio itself, with this workflow loaded: edit it, run it with recorded responses, approve or
        reject the draft and export the project. No live model is called and no email is sent.
      </ExploreCallout>

      <div className="case-body container">
        <Section id="problem" title="The problem">
          <p>
            Many business tasks are a mix of judgement and routine: read an enquiry, decide whether it matters,
            draft a response, send it. Language models are good at the judgement parts, but an automation that lets a
            model act without anyone seeing it is hard to trust — and hard to debug when it goes wrong.
          </p>
          <p>
            AI Workflow Studio is built around that tension. Workflows are visible, every step is inspectable, and
            anything with consequences can be made to wait for approval.
          </p>
        </Section>

        <Section id="solution" title="What it does">
          <p>
            Workflows are assembled from typed steps — triggers, agent steps, conditions, approvals, tools and
            outcomes — in a React editor that runs as a Tauri desktop app. The example shown here qualifies inbound
            website enquiries:
          </p>
          <ol className="steps">
            {workflowSteps.map(([name, detail]) => (
              <li key={name}>
                <strong>{name}</strong> <span>{detail}</span>
              </li>
            ))}
          </ol>
          <p>
            The workflow has four named outcomes: discarded, nurture, rejected and queued. Queuing places the reply
            in an outbox; it does not send it. The capture above shows a run paused at <em>Approve reply</em>.
          </p>
        </Section>

        <Section id="oversight" title="Guardrails and human oversight">
          <p>
            An approval step is a real checkpoint in the runtime, not a confirmation dialog. The run stops, its record
            is persisted, and resuming is validated before the workflow continues. The approver sees what the
            workflow is about to do and why: the score, the drafted message and the classifier’s reasons and red
            flags.
          </p>
          <Figure media={media.aiwsApproval} sizes="(min-width: 760px) 680px, 100vw" className="figure--inset" />
          <CodeExcerpt
            label="Approval step definition"
            code={approvalStep}
            source="Excerpt from the lead qualification workflow file. Template fields are filled from the trigger input and earlier steps."
          />
          <p>
            The classifier is instructed to treat enquiry text as untrusted data written by a member of the public:
            not to follow instructions inside it, to note any such attempt as a red flag, and to score only the
            genuine business content. That is a prompt-level defence, which is why the approval step still matters.
          </p>
          <h3>Fixtures and live calls</h3>
          <p>
            Every run uses one of two modes. <strong>Fixture runs</strong> are deterministic and offline: model and
            tool responses come from fixtures stored with the workflow, so no model or external service is called.
            The same fixtures are exported as the project’s tests. <strong>Live runs</strong> call models through the
            OpenAI Agents SDK. The interface labels which mode produced each run.
          </p>
          <h3>Python steps are trusted code</h3>
          <p>
            Python steps run in a separate interpreter with resource limits and a restricted environment. They still
            run as the same operating-system user, so the source describes them as guardrails for trusted code, not a
            sandbox — and so does this page.
          </p>
        </Section>

        <Section id="architecture" title="Architecture and trade-offs">
          <LayerDiagram
            label="AI Workflow Studio architecture, from interface to model providers"
            layers={[
              { name: "Desktop app", parts: ["React workflow editor", "Tauri SQLite storage"] },
              { name: "Engine", parts: ["Loopback engine API", "Standalone export"] },
              { name: "Runtime", parts: ["Shared workflow runtime"] },
              { name: "Providers", parts: ["Fixture provider", "OpenAI Agents SDK"] },
            ]}
            note="Simplified from the project’s architecture documentation. The editor talks to a local engine API; both the studio and exported workflows execute on the same runtime."
          />
          <p>
            The central decision is <strong>one runtime</strong>. The studio, its tests and standalone exports all
            execute workflows through the same TypeScript package instead of separate implementations, so a workflow
            that passes its fixture tests in the studio is running the same code when exported.
          </p>
          <p>
            Keeping the engine behind a loopback API separates the editor from execution: the interface stays a
            client of the runtime rather than a second place where workflow behaviour lives.
          </p>
        </Section>

        <Section id="testing" title="Testing and limits">
          <p>
            The runtime has tests for approval and rejection paths using fixtures. The project’s own verification
            record for 2 November 2026 reports 886 unit tests passing with one conditional Python skip, 23 browser
            tests and 10 Rust tests passing; Docker checks were skipped on that machine. These are the project’s
            recorded results, not a run performed for this site.
          </p>
          <ul>
            <li>Template integrations are placeholders until connected, and none has run against a real client system.</li>
            <li>Python steps are not sandboxed, as described above.</li>
            <li>Desktop behaviour has not been verified on every platform, and no hosted CI runs are recorded for the inspected version.</li>
          </ul>
        </Section>

        <Section id="next" title="Status and next steps">
          <p>
            AI Workflow Studio is a working prototype. The next steps are connecting template integrations to test
            accounts and recapturing the interface with clearer framing of the workflow graph.
          </p>
        </Section>
      </div>

      <NextProject project={getProject("quant-research-studio")} />
    </article>
  );
}
