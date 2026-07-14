// A deterministic count-up as a WebMotion component, shared by the demos.
// Usage on any entity: count="to: 12480; start: 8; end: 56; decimals: 0".
// Registered through the same registry as the built-ins; the value is a pure
// function of the local frame, so counters land identically in every export.
import { registerComponent, parseProps, num, resolveEasing } from "@superhq/webmotion/elements";

// Format 12480.3 -> "12,480" / 99.99 -> "99.99" without locale dependence.
function formatCount(value, decimals) {
  const fixed = value.toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

let registered = false;

export function registerCount() {
  if (registered) return;
  registered = true;
  registerComponent("count", {
    parse(value) {
      const p = parseProps(value);
      return {
        from: num(p.from, 0),
        to: num(p.to, 0),
        start: num(p.start, 0),
        end: num(p.end, 0),
        decimals: num(p.decimals, 0),
        prefix: p.prefix ?? "",
        suffix: p.suffix ?? "",
        easing: resolveEasing(p.easing ?? "easeOutCubic"),
      };
    },
    render(el, d, ctx) {
      const span = d.end - d.start;
      const t =
        span <= 0 || ctx.frame >= d.end
          ? 1
          : ctx.frame <= d.start
            ? 0
            : d.easing((ctx.frame - d.start) / span);
      el.textContent = d.prefix + formatCount(d.from + (d.to - d.from) * t, d.decimals) + d.suffix;
    },
  });
}
