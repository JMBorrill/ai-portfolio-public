"use client";

import type { MouseEvent, ReactNode } from "react";
import { open } from "./navigation";

/**
 * A link that opens a Living Project's preview from anywhere on the homepage. It is a real link to
 * `/#<slug>`, so it can be copied or opened in a new tab; a plain click opens the preview in place,
 * through the same history handling as the project's own card, so Back and Close agree.
 */
export function DemoLink({ slug, className, children }: { slug: string; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(slug, 1);
  };
  return (
    <a href={`/#${slug}`} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
