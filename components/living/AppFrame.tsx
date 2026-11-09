"use client";

import { useEffect, useRef, useState } from "react";

// A real application, framed. Each application and its back end are served by its demo service
// (demos/aiws, …) on their own origin; this component only places the frame and reports whether the
// application could be reached. Everything inside the frame is the application at its pinned commit.
// The service's /start page prepares the visitor's workspace and posts { source, type: "ready" |
// "error", detail } to this page before opening the application.

const SLOW_MS = 20_000;
// How long a tab waits for others to let go of the workspace before it opens the application.
const CLAIM_MS = 300;

type State = "checking" | "loading" | "ready" | "slow" | "unavailable" | "failed" | "elsewhere";

export type AppFrameProps = {
  /** The demo service's URL, from the build; empty when this copy of the site is not connected. */
  url: string;
  /** The application's name, as visitors know it. */
  name: string;
  /** The `source` its start page puts on messages. */
  source: string;
  /** Visitors' Reset presses; a first load after one asks the service to start again. */
  resets: number;
  /** Where the same work is explained without the application, if it has a case study. */
  caseStudyHref?: string;
  /**
   * The application keeps its whole workspace in memory and writes all of it back on each save
   * (AI Workflow Studio's browser build does), so two tabs open at once would overwrite each other.
   * Then only one tab of this site holds the application at a time: opening it in another tab
   * closes it here, with a way to bring it back.
   */
  oneTabAtATime?: boolean;
};

export function AppFrame({ url, name, source, resets, caseStudyHref, oneTabAtATime = false }: AppFrameProps) {
  const studioUrl = url.replace(/\/$/, "");
  const [state, setState] = useState<State>(studioUrl ? "checking" : "unavailable");
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState("");
  const [src, setSrc] = useState("");
  const restored = useRef(false);
  // A Reset is carried out once, by the first load that succeeds; retries until then still reset.
  const resetDone = useRef(resets === 0);
  const channel = useRef<BroadcastChannel | null>(null);
  const studioOrigin = studioUrl ? new URL(studioUrl).origin : "";

  // Other tabs of this site that show the same application. One channel object per frame: a
  // BroadcastChannel never delivers a message to the object that sent it.
  useEffect(() => {
    if (!oneTabAtATime || typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(`${source}-workspace`);
    c.onmessage = (e) => {
      if (e.data !== "claim") return;
      // Another tab is opening the application: let go of it here. Removing the frame makes the
      // application save any pending edit (it saves when hidden and on pagehide) before it goes.
      setSrc("");
      setState((s) => (s === "unavailable" ? s : "elsewhere"));
      c.postMessage("released");
    };
    channel.current = c;
    return () => {
      c.close();
      channel.current = null;
    };
  }, [oneTabAtATime, source]);

  // Is the service there at all? Its health check must answer 200: behind a reverse proxy a stopped
  // service still answers, with the proxy's error, so a network failure alone is not enough to tell.
  // (The services allow any origin to read their health check, and nothing else.) Then, where
  // needed, claim the workspace from other tabs before the application opens.
  useEffect(() => {
    if (!studioUrl) return;
    let current = true;
    restored.current = false;
    setSrc("");
    setState("checking");
    fetch(`${studioUrl}/healthz`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`health check ${res.status}`);
        const c = channel.current;
        if (c) {
          const released = new Promise<void>((resolve) => {
            const listener = (e: MessageEvent) => e.data === "released" && resolve();
            c.addEventListener("message", listener);
            setTimeout(() => {
              c.removeEventListener("message", listener);
              resolve();
            }, CLAIM_MS);
          });
          c.postMessage("claim");
          await released;
        }
        if (!current) return;
        setSrc(`${studioUrl}/start${resetDone.current ? "" : `?reset=${resets}`}`);
        setState("loading");
      })
      .catch(() => current && setState("unavailable"));
    return () => {
      current = false;
    };
  }, [attempt]);

  // The start page prepares the workspace, says so, then opens the application.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== studioOrigin || e.data?.source !== source) return;
      if (e.data.type === "ready") restored.current = true;
      if (e.data.type === "error") {
        setDetail(String(e.data.detail ?? ""));
        setState("failed");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [studioOrigin, source]);

  useEffect(() => {
    if (state !== "loading") return;
    const timer = setTimeout(() => setState((s) => (s === "loading" ? "slow" : s)), SLOW_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const retry = () => setAttempt((n) => n + 1);
  const framed = Boolean(src) && (state === "loading" || state === "ready" || state === "slow");

  return (
    <div className="studio">
      {framed && (
        <iframe
          key={attempt}
          className="studio__frame"
          src={src}
          title={`${name}, the real application`}
          allow="clipboard-write"
          onLoad={() => {
            // The second load is the application itself, after the start page has prepared it.
            if (!restored.current) return;
            setState("ready");
            resetDone.current = true;
          }}
        />
      )}
      {(state === "checking" || state === "loading") && (
        <div className="studio__state" role="status">
          <p>Opening {name}…</p>
        </div>
      )}
      {state === "slow" && (
        <div className="studio__state" role="status">
          <p>{name} is taking longer than usual to open.</p>
          <div className="studio__actions">
            <button type="button" className="button button--quiet" onClick={() => setState("ready")}>
              Keep waiting
            </button>
            <button type="button" className="button" onClick={retry}>
              Try again
            </button>
          </div>
        </div>
      )}
      {state === "elsewhere" && (
        <div className="studio__state" role="status">
          <p>
            {name} is open in another tab of this site. Your workspace can be open in one tab at a time, so neither tab
            overwrites the other’s changes.
          </p>
          <div className="studio__actions">
            <button type="button" className="button" onClick={retry}>
              Use it here
            </button>
          </div>
        </div>
      )}
      {(state === "unavailable" || state === "failed") && (
        <div className="studio__state" role="alert">
          <p className="studio__error">
            {state === "failed"
              ? `${name} could not be opened${detail ? `: ${detail}` : "."}`
              : studioUrl
                ? `${name} is not reachable right now.`
                : `${name} is not connected to this copy of the site.`}
          </p>
          <p>
            The workspace runs the real application from a separate demo service.
            {caseStudyHref && (
              <>
                {" "}
                Without it, the <a href={caseStudyHref}>case study</a> explains the same work.
              </>
            )}
          </p>
          {studioUrl && (
            <div className="studio__actions">
              <button type="button" className="button" onClick={retry}>
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
