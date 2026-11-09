"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { back, CHANGE, close, open, viewFromHash, type View } from "./navigation";
import { SpringValue } from "./spring";

// A flagship project opened in place: card → preview → full-window workspace, and back. One
// interruptible spring drives a progress value p (0 card, 1 preview, 2 workspace); every view change
// retargets it from where it is. Adapted from JMBorrill/portfolio at 042649c (components/stage). The workspace's content is the
// project's own: for AI Workflow Studio, the real application in a frame.

type Rect = { x: number; y: number; w: number; h: number };

const PREVIEW_MAX_WIDTH = 880;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, iframe, [tabindex]:not([tabindex="-1"])';
const PREVIEW_MAX_HEIGHT = 780;

function targets(origin: Rect): Rect[] {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const margin = vw < 640 ? 12 : 32;
  const w = Math.min(vw - 2 * margin, PREVIEW_MAX_WIDTH);
  const h = Math.min(vh - 2 * margin, PREVIEW_MAX_HEIGHT);
  return [origin, { x: (vw - w) / 2, y: (vh - h) / 2, w, h }, { x: 0, y: 0, w: vw, h: vh }];
}

function rectAt(rects: Rect[], p: number): Rect {
  const clamped = Math.min(Math.max(p, 0), 2);
  const i = Math.min(Math.floor(clamped), 1);
  const t = clamped - i;
  const [a, b] = [rects[i], rects[i + 1]];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
}

export type LivingProjectProps = {
  slug: string;
  title: string;
  /** Shown in the workspace bar, so the mode is never in doubt. */
  modeLabel: string;
  /** Added to it on narrow screens, where the application works only in part. */
  narrowNote?: string;
  /** The preview's content: what the project is and what the workspace shows. */
  preview: ReactNode;
  /** Mounted the first time the workspace opens, then kept for the rest of the visit. `resets`
   *  counts the visitor's Reset presses, so the workspace can start again from its example. */
  Workspace: ComponentType<{ resets: number }>;
};

export function LivingProject({ slug, title, modeLabel, narrowNote, preview, Workspace }: LivingProjectProps) {
  const [view, setView] = useState<View>(0);
  const [visible, setVisible] = useState(false);
  const [workspaceMounted, setWorkspaceMounted] = useState(false);
  const [resets, setResets] = useState(0);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const frame = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const spring = useRef<SpringValue | null>(null);
  const rects = useRef<Rect[]>([]);
  const paint = useRef((p: number) => {});
  const opener = useRef<HTMLElement | null>(null);
  const titleId = `${slug}-living-title`;

  const media = () => document.getElementById(`${slug}-media`);
  const measure = () => {
    // The frame grows from the card's capture; when that card is in a hidden tab (the project was
    // opened from elsewhere on the page), from whatever opened it.
    const shown = media()?.getBoundingClientRect();
    const from = opener.current ?? (document.activeElement as HTMLElement | null);
    const r = shown?.width ? shown : from && from !== document.body ? from.getBoundingClientRect() : undefined;
    const origin = r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: window.innerHeight, w: window.innerWidth, h: 0 };
    rects.current = targets(origin);
  };

  // Follow the URL. A view reached by direct entry opens without motion.
  useEffect(() => {
    let first = true;
    const sync = () => {
      const next = viewFromHash(slug);
      setView((current) => {
        if (current === 0 && next > 0) opener.current = document.activeElement as HTMLElement | null;
        return next;
      });
      if (next > 0) {
        measure();
        if (first) spring.current?.set(next);
      }
      first = false;
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
  }, [slug]);

  // The spring paints the frame directly: geometry, corner radius and a --p custom property that
  // the layers inside read for their opacity.
  useLayoutEffect(() => {
    paint.current = (p: number) => {
      const el = frame.current;
      if (!el) return;
      const r = rectAt(rects.current, p);
      Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      el.style.setProperty("--p", String(p));
      if (backdrop.current) backdrop.current.style.opacity = String(Math.min(Math.max(p, 0), 1));
      if (p <= 0.001 && viewFromHash(slug) === 0) setVisible(false);
    };
    spring.current = new SpringValue(0, (p) => paint.current(p));
    const resize = () => {
      measure();
      paint.current(spring.current!.value);
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      spring.current?.stop();
    };
  }, [slug]);

  // The frame mounts after the spring may already have moved (always, with reduced motion), so it is
  // painted where the spring stands before the browser shows it.
  useLayoutEffect(() => {
    if (visible) paint.current(spring.current!.value);
  }, [visible]);

  useEffect(() => {
    if (view > 0) setVisible(true);
    if (view === 2) setWorkspaceMounted(true);
    measure();
    spring.current?.to(view);
  }, [view]);

  // While open, the page behind neither scrolls nor takes focus, and the card's capture is lifted
  // out of it into the frame. Its scroll position is kept.
  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    const behind = [...document.body.children].filter((el) => el instanceof HTMLElement && !el.matches("script, [data-living-root]")) as HTMLElement[];
    root.style.overflow = "hidden";
    behind.forEach((el) => (el.inert = true));
    const card = media();
    if (card) card.style.visibility = "hidden";
    return () => {
      root.style.overflow = "";
      behind.forEach((el) => (el.inert = false));
      if (card) card.style.visibility = "";
      // Focus returns to what opened the project, or to the card's own control.
      const target = opener.current?.isConnected && opener.current !== document.body ? opener.current : document.getElementById(`${slug}-open`);
      target?.focus();
      opener.current = null;
    };
  }, [visible, slug]);

  // The confirmation takes focus when it appears; Reset takes it back afterwards.
  const confirmed = useRef(false);
  useEffect(() => {
    if (confirmingReset) confirmButton.current?.focus();
    else if (confirmed.current) resetButton.current?.focus();
    confirmed.current = confirmingReset;
  }, [confirmingReset]);
  useEffect(() => {
    if (view !== 2) setConfirmingReset(false);
  }, [view]);

  // Each view's title takes focus when it appears.
  useEffect(() => {
    if (view > 0 && visible) heading.current?.focus();
  }, [view, visible]);

  // Escape first cancels an open Reset confirmation; otherwise it closes the project, unless
  // something inside handled it first.
  useEffect(() => {
    if (view === 0) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (confirmingReset) setConfirmingReset(false);
      else close(slug);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [view, slug, confirmingReset]);

  // Tab and Shift+Tab wrap inside the dialog, as in any modal. A framed application keeps its own
  // focus order; leaving its last control reaches the guard after it, which wraps to the first.
  const wrapFocus = (to: "first" | "last") => {
    const items = [...frame.current!.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[inert]") && !el.hasAttribute("data-focus-guard"));
    (to === "first" ? items[0] : items[items.length - 1])?.focus();
  };
  const modeId = `${slug}-living-mode`;

  if (!visible && !workspaceMounted) return null;

  return createPortal(
    <div className="living" data-living-root="" hidden={!visible}>
      <div ref={backdrop} className="living__backdrop" onClick={() => close(slug)} aria-hidden="true" />
      <div
        ref={frame}
        className="living__frame"
        data-view={view}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={view === 2 ? modeId : undefined}
      >
        <span tabIndex={0} data-focus-guard="" className="visually-hidden" onFocus={() => wrapFocus("last")} />
        <header className={`living__bar${confirmingReset ? " living__bar--confirming" : ""}`}>
          {view === 2 && (
            <button type="button" className="living__control" onClick={() => back(slug)} aria-label="Back to the overview">
              <span aria-hidden="true">←</span>
              <span className="living__wide">Overview</span>
            </button>
          )}
          <h2 id={titleId} ref={heading} tabIndex={-1} className="living__title">
            {title} <span className="living__view">{view === 2 ? "Workspace" : "Overview"}</span>
          </h2>
          {view === 2 && !confirmingReset && (
            <button type="button" ref={resetButton} className="living__control" onClick={() => setConfirmingReset(true)}>
              Reset
            </button>
          )}
          {view === 2 && confirmingReset && (
            // Reset discards the visitor's changes, so it is confirmed first.
            <div role="group" aria-labelledby={`${slug}-reset-question`} className="living__confirm">
              <span id={`${slug}-reset-question`} className="living__wide">
                Discard your changes and restore the example?
              </span>
              <button
                type="button"
                ref={confirmButton}
                className="living__control living__control--primary"
                onClick={() => {
                  setConfirmingReset(false);
                  setResets((n) => n + 1);
                  setAnnouncement("The workspace has been reset to the example.");
                }}
              >
                Discard<span className="living__wide"> and reset</span>
              </button>
              <button type="button" className="living__control" onClick={() => setConfirmingReset(false)}>
                Cancel
              </button>
            </div>
          )}
          {view === 1 && (
            <button type="button" className="living__control living__control--primary" onClick={() => open(slug, 2)}>
              <span>
                Explore<span className="living__wide"> the workspace</span>
              </span>
            </button>
          )}
          <button type="button" className="living__control" onClick={() => close(slug)}>
            Close
          </button>
        </header>
        <div className="living__layer living__layer--preview" inert={view !== 1}>
          {preview}
          <p className="living__explore">
            <button type="button" className="button" onClick={() => open(slug, 2)}>
              Explore the workspace
            </button>
          </p>
        </div>
        {workspaceMounted && (
          <div className="living__layer living__layer--workspace" inert={view !== 2}>
            <p id={modeId} className="living__mode">
              {modeLabel}
              {narrowNote && <span className="living__narrow"> {narrowNote}</span>}
            </p>
            <Workspace key={resets} resets={resets} />
          </div>
        )}
        <span tabIndex={0} data-focus-guard="" className="visually-hidden" onFocus={() => wrapFocus("first")} />
      </div>
      <p role="status" className="visually-hidden">
        {announcement}
      </p>
    </div>,
    document.body,
  );
}

/** The card's control that opens the preview. Rendered only once the page can run the project. */
export function OpenProjectButton({ slug, title }: { slug: string; title: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return (
    <button type="button" id={`${slug}-open`} className="button" onClick={() => open(slug, 1)}>
      Open the project<span className="visually-hidden">: {title}</span>
      <span className="arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}
