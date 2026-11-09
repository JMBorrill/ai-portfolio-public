import Link from "next/link";
import type { ReactNode } from "react";
import { caseStudyPath, type Project } from "@/lib/projects";
import { StackList } from "./StackList";

export function CaseStudyHeader({ project, lede }: { project: Project; lede: string }) {
  return (
    <header className="case-header container">
      <p className="eyebrow">
        <Link href="/#projects">Projects</Link> <span aria-hidden="true">/</span> Flagship
      </p>
      <h1>{project.title}</h1>
      <p className="lede">{lede}</p>
      <dl className="facts">
        <div>
          <dt>Status</dt>
          <dd>{project.status}</dd>
        </div>
        <div>
          <dt>Built with</dt>
          <dd>
            <StackList stack={project.stack} label={`${project.title} technologies`} />
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>Private repository</dd>
        </div>
      </dl>
    </header>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="case-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

export type Layer = { name: string; parts: string[] };

// A layered architecture diagram written as an ordered list, so it reads in order without CSS.
export function LayerDiagram({ label, layers, note }: { label: string; layers: Layer[]; note: string }) {
  return (
    <figure className="layers">
      <ol aria-label={label}>
        {layers.map((layer) => (
          <li key={layer.name}>
            <span className="layers__name">{layer.name}</span>
            <ul>
              {layer.parts.map((part) => (
                <li key={part}>{part}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <figcaption>{note}</figcaption>
    </figure>
  );
}

export function CodeExcerpt({ label, source, code }: { label: string; source: string; code: string }) {
  return (
    <figure className="code">
      <pre tabIndex={0} aria-label={label}>
        <code>{code}</code>
      </pre>
      <figcaption>{source}</figcaption>
    </figure>
  );
}

export function NextProject({ project }: { project: Project }) {
  return (
    <nav className="next-project container" aria-label="Next project">
      <p className="eyebrow">Next flagship</p>
      <Link href={caseStudyPath(project.slug)}>
        <span className="next-project__title">{project.title}</span>
        <span className="next-project__summary">{project.summary}</span>
      </Link>
    </nav>
  );
}
