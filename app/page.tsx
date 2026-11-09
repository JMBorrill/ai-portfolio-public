import { AiwsLivingProject } from "@/components/aiws/AiwsLivingProject";
import { CharityLivingProject } from "@/components/charity/CharityLivingProject";
import { CriteriaLivingProject } from "@/components/criteria/CriteriaLivingProject";
import { FootballLivingProject } from "@/components/football/FootballLivingProject";
import { HeroFx } from "@/components/HeroFx";
import { DemoLink } from "@/components/living/DemoLink";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectTabs, type ProjectTab } from "@/components/ProjectTabs";
import { QrsLivingProject } from "@/components/qrs/QrsLivingProject";
import { SatelliteLivingProject } from "@/components/satellite/SatelliteLivingProject";
import { TypedHeading } from "@/components/TypedHeading";
import { media } from "@/content/media";
import { projects } from "@/lib/projects";

// Projects with a live demo; the rest show a text card.
const demoMedia: Record<string, (typeof media)[keyof typeof media]> = {
  "ai-workflow-studio": media.aiwsWorkspace,
  "quant-research-studio": media.qrsWorkspace,
  "charity-website": media.charityHome,
  "schools-football": media.footballHome,
  "criteria-chat": media.criteriaAnswer,
  "satellite-intelligence-lab": media.satelliteCard,
};

// Related projects share one tab, in the place of the first of them; a second row of tabs inside
// names each one, so it is plain there is more than one.
const GROUPS = [
  { slug: "research", title: "Research", label: "Research projects", members: ["quant-research-studio", "satellite-intelligence-lab", "small-model-training"] },
  { slug: "client-work", title: "Client Delivery", label: "Client projects", members: ["charity-website", "schools-football"] },
];

const card = (slug: string) => {
  const project = projects.find((p) => p.slug === slug)!;
  return { project, panel: <ProjectCard project={project} media={demoMedia[slug]} /> };
};

const tabs: ProjectTab[] = projects.flatMap((project) => {
  const group = GROUPS.find((g) => g.members.includes(project.slug));
  if (!group) return [{ slug: project.slug, title: project.label, panel: card(project.slug).panel }];
  if (project.slug !== projects.find((p) => group.members.includes(p.slug))!.slug) return [];
  const inner = group.members.map((slug) => {
    const { project: p, panel } = card(slug);
    return { slug, title: p.title, panel };
  });
  return [{ slug: group.slug, title: group.title, contains: group.members, panel: <ProjectTabs nested label={group.label} tabs={inner} /> }];
});

// AI Workflow Studio is the flagship: the hero shows it and opens it.
const hero = media.aiwsWorkspace;

export default function HomePage() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <HeroFx />
        <div className="container hero__inner">
          <TypedHeading id="hero-title" className="hero__title" text="I build software and AI systems that make complex work easier." />
          <div className="hero__copy">
            <div className="hero__actions">
              <DemoLink slug="ai-workflow-studio" className="button">
                Try AI Workflow Studio
                <span className="arrow" aria-hidden="true">
                  →
                </span>
              </DemoLink>
              <a className="text-link" href="#projects">
                All work
              </a>
            </div>
          </div>
          <DemoLink slug="ai-workflow-studio" className="hero__shot">
            <span className="visually-hidden">Open AI Workflow Studio</span>
            <div className="app-frame">
              <img
                src={hero.src}
                srcSet={hero.srcSet}
                sizes="(min-width: 1000px) 60vw, 100vw"
                width={hero.width}
                height={hero.height}
                alt={hero.alt}
                fetchPriority="high"
              />
            </div>
          </DemoLink>
        </div>
      </section>

      <section id="projects" className="container section" aria-labelledby="projects-title">
        <h2 id="projects-title" className="visually-hidden">
          Work
        </h2>
        <ProjectTabs tabs={tabs} />
        <AiwsLivingProject />
        <QrsLivingProject />
        <CharityLivingProject />
        <FootballLivingProject />
        <CriteriaLivingProject />
        <SatelliteLivingProject />
      </section>
    </>
  );
}
