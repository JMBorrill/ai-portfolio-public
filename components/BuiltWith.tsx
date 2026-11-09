import type { Built } from "@/lib/projects";

const GROUPS: { key: keyof Built; label: string }[] = [
  { key: "languages", label: "Languages" },
  { key: "frameworks", label: "Frameworks" },
  { key: "tools", label: "Tools" },
];

/** What a project is built with, by kind. Renders nothing when nothing is recorded. */
export function BuiltWith({ built, label }: { built: Built; label: string }) {
  const groups = GROUPS.filter((g) => built[g.key].length > 0);
  if (groups.length === 0) return null;
  return (
    <dl className="built" aria-label={label}>
      {groups.map((g) => (
        <div key={g.key}>
          <dt>{g.label}</dt>
          <dd>
            {built[g.key].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
