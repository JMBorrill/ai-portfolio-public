"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "./living/spring";

const RATE = 22; // letters a second
const DELAY = 300; // ms before the first

// A heading that types itself out once. The whole text is laid out from the start, so neither the
// page nor the lines move as it types; screen readers get the whole text at once. With reduced
// motion, or without JavaScript, it is simply there.
export function TypedHeading({ text, id, className = "" }: { text: string; id?: string; className?: string }) {
  const [shown, setShown] = useState(0);
  const done = shown >= text.length;

  useEffect(() => {
    if (prefersReducedMotion()) return setShown(text.length);
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      start ||= now;
      const n = Math.min(text.length, Math.floor((now - start - DELAY) / (1000 / RATE)));
      if (n > 0) setShown(n);
      if (n < text.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return (
    <h1 id={id} className={`typed ${className}`} data-done={done || undefined}>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {[...text].map((ch, i) => (
          <span key={i} className="typed__char" data-on={i < shown || undefined}>
            {ch}
            {/* Inside the last typed letter, so it can never fall onto a line of its own. */}
            {i === shown - 1 && <span className="typed__caret" />}
          </span>
        ))}
      </span>
      <noscript>
        <style>{`.typed__char { opacity: 1; } .typed__caret { display: none; }`}</style>
      </noscript>
    </h1>
  );
}
