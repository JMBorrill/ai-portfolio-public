"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CHANGE } from "./living/navigation";
import { prefersReducedMotion } from "./living/spring";

export type ProjectTab = {
  slug: string;
  title: string;
  panel: ReactNode;
  /** The projects shown in this tab's panel, when it holds more than one; their number shows in the tab. */
  contains?: string[];
};

type ProjectTabsProps = {
  tabs: ProjectTab[];
  /** The row's accessible name. */
  label?: string;
  /** A second row inside a tab's panel, for the projects it holds: smaller, left-aligned. */
  nested?: boolean;
};

// A row of project names; choosing one shows that project below. Every panel is in the page, so
// without JavaScript they all simply read in order.
export function ProjectTabs({ tabs, label = "Projects", nested = false }: ProjectTabsProps) {
  const [active, setActive] = useState(tabs[0].slug);
  const [more, setMore] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  // Where the row scrolls and names are still hidden to the right, its edge fades.
  useEffect(() => {
    const row = list.current;
    if (!row) return;
    const check = () => setMore(row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(row);
    row.addEventListener("scroll", check, { passive: true });
    return () => {
      observer.disconnect();
      row.removeEventListener("scroll", check);
    };
  }, []);

  // A Living Project opened by its URL opens from its card, so that card has to be the one showing.
  useEffect(() => {
    const sync = () => {
      const slug = window.location.hash.slice(1).split("/")[0];
      const tab = tabs.find((t) => t.slug === slug || t.contains?.includes(slug));
      if (tab) setActive(tab.slug);
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    window.addEventListener(CHANGE, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener(CHANGE, sync);
    };
  }, [tabs]);

  // Where the row scrolls (narrow screens), keep the chosen name in view.
  useEffect(() => {
    const row = list.current;
    const tab = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    const left = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2;
    row.scrollTo({
      left,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [active]);

  const onKeyDown = (e: KeyboardEvent) => {
    const index = tabs.findIndex((tab) => tab.slug === active);
    const next = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    setActive(tab.slug);
    document.getElementById(`${tab.slug}-tab`)?.focus();
  };

  return (
    <>
      <div className={nested ? "project-tabs-wrap project-tabs-wrap--nested" : "project-tabs-wrap"} data-overflow={more || undefined}>
        <div ref={list} className="project-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
          {tabs.map((tab) => (
            <button
              key={tab.slug}
              type="button"
              role="tab"
              id={`${tab.slug}-tab`}
              className="project-tab"
              aria-selected={tab.slug === active}
              aria-controls={`${tab.slug}-panel`}
              tabIndex={tab.slug === active ? 0 : -1}
              onClick={() => setActive(tab.slug)}
            >
              {tab.title}
              {tab.contains && (
                <span className="project-tab__count">
                  <span aria-hidden="true">{tab.contains.length}</span>
                  <span className="visually-hidden">, {tab.contains.length} projects</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.slug}
          role="tabpanel"
          id={`${tab.slug}-panel`}
          className="project-panel"
          aria-labelledby={`${tab.slug}-tab`}
          tabIndex={0}
          data-active={tab.slug === active || undefined}
        >
          {tab.panel}
        </div>
      ))}
      <noscript>
        <style>{`.project-tabs-wrap { display: none; } .project-panel:not([data-active]) { display: block; }`}</style>
      </noscript>
    </>
  );
}
