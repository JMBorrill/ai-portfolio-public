import type { Metadata } from "next";
import { CaseStudyHeader, CodeExcerpt, LayerDiagram, NextProject, Section } from "@/components/CaseStudy";
import { Figure } from "@/components/Figure";
import { ExploreCallout } from "@/components/living/ExploreCallout";
import { media } from "@/content/media";
import { getProject } from "@/lib/projects";

const project = getProject("quant-research-studio");

export const metadata: Metadata = {
  title: project.title,
  description: project.highlight,
};

// Copied verbatim from the strategy compiler (dedented by one level).
const compilerLoop = String.raw`lines += ["", "def run(ctx: Run) -> None:"]
for node_id in topological_order(doc):
    node = nodes[node_id]
    params = ops[node_id].params.model_validate(node.params).model_dump(mode="json")
    inputs = ", ".join(f"{port!r}: {src.node}[{src.port!r}]" for port, src in sorted(wiring[node_id].items()))
    lines.append(f"    {node_id} = ctx.op({node_id!r}, {node.operator!r}, {node.version}, {{{inputs}}}, {params!r})")
return "\n".join(lines) + "\n"`;

export default function QuantResearchStudioPage() {
  return (
    <article className="case">
      <CaseStudyHeader
        project={project}
        lede="A visual studio for building and testing trading strategies where reproducibility comes first: every strategy compiles to deterministic, readable Python, and every result can be traced back to the code that produced it."
      />

      <Figure media={media.qrsWorkspace} priority sizes="(min-width: 1200px) 1120px, 100vw" className="case-hero container" />

      <ExploreCallout slug="quant-research-studio">
        Open the backtesting platform itself, with an EMA crossover strategy loaded: change a parameter, run a real backtest
        on synthetic data, inspect the results and export the strategy as standalone Python.
      </ExploreCallout>

      <div className="case-body container">
        <Section id="problem" title="The problem">
          <p>
            Backtests are easy to make persuasive and hard to trust. A signal can quietly use data that would not
            have been available at the time, a script can change between runs, and a good-looking result can be
            impossible to reproduce a week later.
          </p>
          <p>
            The backtesting platform treats those as engineering problems: make the strategy an explicit artefact,
            make its execution deterministic, and test the operators for the leaks that research mistakes are made
            of.
          </p>
        </Section>

        <Section id="solution" title="What it does">
          <p>
            Strategies are graphs of registered, versioned operators — sources, indicators, rules, positions and
            backtests — connected in a React editor. A validated graph compiles to a Python module, which a worker
            runs against versioned datasets using NautilusTrader for the simulation. Results are stored with their
            provenance, and the same compiled code can be exported as a standalone Python bundle.
          </p>
          <Figure media={media.qrsGraph} sizes="(min-width: 1200px) 1120px, 100vw" />
        </Section>

        <Section id="reproducibility" title="Reproducibility by construction">
          <p>
            The compiler’s output depends only on the graph’s nodes, edges and normalised parameters, emitted in a
            deterministic dependency order. Canvas layout and display names never reach the code. The same strategy
            therefore always compiles to byte-identical Python, and the code’s SHA-256 hash identifies exactly what
            was executed.
          </p>
          <CodeExcerpt
            label="Strategy compiler excerpt"
            code={compilerLoop}
            source="Excerpt from the strategy compiler: one line of generated Python per node, in topological order, with parameters validated against the operator’s schema."
          />
          <p>
            The studio, the command line and export all pass through one compile-and-check gate, so they accept and
            refuse the same strategies. Generated code is readable on purpose: the studio shows it alongside each
            strategy, and exported code can be reviewed without the studio.
          </p>
        </Section>

        <Section id="discipline" title="Research discipline">
          <p>
            Lookahead bias is tested directly. Operator contract tests rewrite later data and check that earlier
            outputs do not change, and deliberately leaky operators confirm that those tests catch a leak when one
            exists.
          </p>
          <p>
            Each run records the compiled-code and result identifiers and labels the weakest class of evidence among
            the datasets it read, so a result built on synthetic data says so. An analysis-method registry organises
            descriptive, inference, selection and robustness methods for evaluating results.
          </p>
          <Figure media={media.qrsResults} sizes="(min-width: 760px) 480px, 100vw" className="figure--inset figure--narrow" />
        </Section>

        <Section id="architecture" title="Architecture">
          <LayerDiagram
            label="Backtesting Platform architecture, from editor to outputs"
            layers={[
              { name: "Editor", parts: ["React graph editor"] },
              { name: "Local service", parts: ["Local API and queue", "Validated graph compiler"] },
              { name: "Execution", parts: ["Python worker", "Versioned datasets", "NautilusTrader simulation"] },
              { name: "Outputs", parts: ["Results and provenance", "Standalone Python bundle"] },
            ]}
            note="Simplified from the compiler, export code and project documentation. The compiler feeds both the worker and the standalone export."
          />
          <p>
            Compiling to ordinary Python, rather than interpreting the graph at run time, keeps one artefact at the
            centre: what the worker runs, what export produces and what the hash identifies are the same code.
          </p>
        </Section>

        <Section id="testing" title="Testing and limits">
          <p>
            The project’s latest verification report records a local Linux gate, 36 mutations caught by the test
            suite, and research and leakage checks. These are the project’s recorded results, not a run performed for
            this site.
          </p>
          <ul>
            <li>macOS and hosted verification remain outstanding. The hosted CI run for the inspected version executed no steps, so it provides no test results either way.</li>
            <li>Research on real, licensed market data is still to come; the captures here use synthetic data.</li>
            <li>The studio is a research tool. Nothing on this page is a claim of trading performance.</li>
          </ul>
        </Section>

        <Section id="next" title="Status and next steps">
          <p>
            The backtesting platform is a working prototype. Next are hosted and cross-platform verification and a research
            programme on licensed data.
          </p>
        </Section>
      </div>

      <NextProject project={getProject("ai-workflow-studio")} />
    </article>
  );
}
