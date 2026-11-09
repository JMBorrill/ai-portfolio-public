import Link from "next/link";
import type { Media } from "@/content/media";
import { caseStudyPath, type Project } from "@/lib/projects";
import { OpenProjectButton } from "./living/LivingProject";
import { BuiltWith } from "./BuiltWith";

type ProjectCardProps = {
  project: Project;
  /** The capture of a project with a live demo, which opens in place as a Living Project. Flagships also have a case study. */
  media?: Media;
  priority?: boolean;
};

export function ProjectCard({ project, media, priority = false }: ProjectCardProps) {
  const headingId = `${project.slug}-title`;
  return (
    // The id makes a link to /#<slug> land on this card without JavaScript; with it, the demo opens.
    <article id={project.slug} className={media ? "flagship" : "flagship flagship--plain"} aria-labelledby={headingId}>
      {media && (
        <div className="flagship__visual">
          <div id={`${project.slug}-media`} className="flagship__media app-frame">
            <img
              src={media.src}
              srcSet={media.srcSet}
              sizes="(min-width: 960px) 60vw, 100vw"
              width={media.width}
              height={media.height}
              alt={media.alt}
              fetchPriority={priority ? "high" : undefined}
              decoding="async"
            />
          </div>
          <BuiltWith built={project.built} label={`${project.title}: built with`} />
        </div>
      )}
      <div className="flagship__body">
        <h3 id={headingId} className="flagship__title">
          {project.title}
        </h3>
        <p className="flagship__summary">{project.summary}</p>
        {project.highlight && <p>{project.highlight}</p>}
        {!media && <BuiltWith built={project.built} label={`${project.title}: built with`} />}
        {(media || project.repository) && (
          <div className="flagship__actions">
            {media && <OpenProjectButton slug={project.slug} title={project.title} />}
            {project.repository && (
              <a className="text-link" href={project.repository}>
                View on GitHub<span className="visually-hidden">: {project.title}</span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            )}
            {/* The demo's preview links to the case study; without JavaScript there is no demo, so the card does. */}
            {media && project.tier === "flagship" && (
              <noscript>
                <Link className="text-link" href={caseStudyPath(project.slug)}>
                  Read the case study<span className="visually-hidden">: {project.title}</span>
                </Link>
              </noscript>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
