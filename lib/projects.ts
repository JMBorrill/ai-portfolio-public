import data from "@/content/projects.json";

export type Built = { languages: string[]; frameworks: string[]; tools: string[] };

export type Project = {
  slug: string;
  title: string;
  /** Its name in the row of projects: the kind of work, in the words of the roles applied for. */
  label: string;
  tier: "flagship" | "supporting";
  summary: string;
  highlight?: string;
  status: string;
  /** Languages, frameworks and tools, from the project's own dependency files. */
  built: Built;
  /** All of them in one list, for compact places such as a case study's facts. */
  stack: string[];
  /** The project's GitHub repository. The owner is making these public before release (8 November 2026). */
  repository?: string;
};

// Only visitor-facing fields leave this module; evidence pointers stay internal.
export const projects: Project[] = data.map((entry) => ({
  slug: entry.slug,
  title: entry.title,
  label: entry.label,
  tier: entry.tier as Project["tier"],
  summary: entry.summary,
  highlight: "highlight" in entry ? entry.highlight : undefined,
  status: entry.status,
  built: entry.built,
  stack: [...entry.built.languages, ...entry.built.frameworks, ...entry.built.tools],
  repository: entry.publicRepositoryUrl ?? undefined,
}));

export function getProject(slug: string): Project {
  const project = projects.find((p) => p.slug === slug);
  if (!project) throw new Error(`Unknown project: ${slug}`);
  return project;
}

export function caseStudyPath(slug: string) {
  return `/projects/${slug}/`;
}
