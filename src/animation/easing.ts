/**
 * Maps normalized progress `t` in `[0, 1]` to an eased value.
 */
export type EasingFunction = (t: number) => number;

export const linear: EasingFunction = (t) => t;

export const easeInQuad: EasingFunction = (t) => t * t;
export const easeOutQuad: EasingFunction = (t) => t * (2 - t);
export const easeInOutQuad: EasingFunction = (t) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

export const easeInCubic: EasingFunction = (t) => t * t * t;
export const easeOutCubic: EasingFunction = (t) => {
  const u = t - 1;
  return u * u * u + 1;
};
export const easeInOutCubic: EasingFunction = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeInSine: EasingFunction = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const easeOutSine: EasingFunction = (t) => Math.sin((t * Math.PI) / 2);
export const easeInOutSine: EasingFunction = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * Cubic Bezier easing, using the same model as CSS `cubic-bezier()`.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDerivX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveX = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const xEst = sampleX(t) - x;
      if (Math.abs(xEst) < 1e-6) return t;
      const d = sampleDerivX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= xEst / d;
    }
    // Bisection fallback for flat regions where Newton stalls.
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const xEst = sampleX(t);
      if (Math.abs(xEst - x) < 1e-6) return t;
      if (x > xEst) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveX(t));
  };
}
