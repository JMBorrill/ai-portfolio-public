// An interruptible spring-driven value, from AI Workflow Studio's motion primitives
// (references/examples/aiws-motion.ts, trimmed to what the Living Project frame needs). Calling
// `to()` mid-flight retargets from the current position and velocity, so a reversal never jumps.

const DAMPING_RATIO = 0.8; // ≈ 1.5% overshoot
const RESPONSE = 0.42; // seconds
const STIFFNESS = (2 * Math.PI / RESPONSE) ** 2;
const DAMPING = (4 * Math.PI * DAMPING_RATIO) / RESPONSE;

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export class SpringValue {
  value: number;
  private velocity = 0;
  private target: number;
  private frame = 0;
  private last = 0;

  constructor(
    initial: number,
    private onUpdate: (value: number) => void,
  ) {
    this.value = initial;
    this.target = initial;
  }

  /** Jump without animation. */
  set(value: number) {
    this.stop();
    this.value = this.target = value;
    this.velocity = 0;
    this.onUpdate(value);
  }

  to(target: number) {
    if (prefersReducedMotion()) return this.set(target);
    this.target = target;
    if (!this.frame) {
      this.last = 0;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private tick = (time: number) => {
    const dt = this.last ? Math.min(0.064, (time - this.last) / 1000) : 1 / 60;
    this.last = time;
    // Semi-implicit Euler in 1 ms substeps.
    const steps = Math.max(1, Math.round(dt * 1000));
    for (let i = 0; i < steps; i++) {
      this.velocity += (-STIFFNESS * (this.value - this.target) - DAMPING * this.velocity) * (dt / steps);
      this.value += this.velocity * (dt / steps);
    }
    const done = Math.abs(this.value - this.target) < 0.002 && Math.abs(this.velocity) < 0.02;
    if (done) {
      this.value = this.target;
      this.velocity = 0;
    }
    this.onUpdate(this.value);
    this.frame = done ? 0 : requestAnimationFrame(this.tick);
  };

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
