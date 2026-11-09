"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { hrefFor } from "./navigation";

/** A case study's way into its Living Project workspace. Rendered only where the workspace can run. */
export function ExploreCallout({ slug, children }: { slug: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return (
    <aside className="explore-callout container" aria-label="Working demo">
      <p>{children}</p>
      <Link className="button" href={hrefFor(slug, 2)}>
        Explore the workspace
      </Link>
    </aside>
  );
}
