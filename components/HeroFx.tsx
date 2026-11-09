"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./living/spring";

// The hero panel's moving texture: a dot grid drifting slowly, a glow drifting behind the product,
// and, with a mouse, the dots under the pointer lighting up. Decorative only (aria-hidden), and
// still for anyone who prefers reduced motion. The motion is CSS transforms; the pointer only
// updates two custom properties, once per frame at most.
export function HeroFx() {
  const fx = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = fx.current;
    const hero = el?.parentElement;
    if (!el || !hero || prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = hero.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
        el.dataset.pointer = "";
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      delete el.dataset.pointer;
    };
    hero.addEventListener("pointermove", move);
    hero.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div ref={fx} className="hero-fx" aria-hidden="true">
      <div className="hero-fx__glow" />
      <div className="hero-fx__dots" />
      <div className="hero-fx__spot" />
    </div>
  );
}
