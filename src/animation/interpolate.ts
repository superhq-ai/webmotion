import { linear, type EasingFunction } from "./easing.js";

/** Behavior outside the input range. */
export type ExtrapolateMode = "extend" | "clamp";

export interface InterpolateOptions {
  /** Easing applied to the normalized position within each segment. */
  easing?: EasingFunction;
  /** Behavior below the first input value. Default `"extend"`. */
  extrapolateLeft?: ExtrapolateMode;
  /** Behavior above the last input value. Default `"extend"`. */
  extrapolateRight?: ExtrapolateMode;
}

/**
 * Map a value from one range to another.
 *
 *   const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
 *
 * `input` must be strictly increasing. `input` and `output` must have the same
 * length and at least two entries:
 *
 *   interpolate(frame, [0, 30, 60], [0, 1, 0]);  // fade in then out
 */
export function interpolate(
  value: number,
  input: readonly number[],
  output: readonly number[],
  options: InterpolateOptions = {},
): number {
  if (input.length < 2) {
    throw new Error("interpolate: input range needs at least two values");
  }
  if (input.length !== output.length) {
    throw new Error(
      `interpolate: input (${input.length}) and output (${output.length}) must be the same length`,
    );
  }

  const easing = options.easing ?? linear;
  const extrapolateLeft = options.extrapolateLeft ?? "extend";
  const extrapolateRight = options.extrapolateRight ?? "extend";

  // Locate the segment [input[i], input[i+1]] that contains `value`.
  let i = 0;
  for (; i < input.length - 1; i++) {
    if (value <= input[i + 1]!) break;
  }
  i = Math.min(i, input.length - 2);

  const inMin = input[i]!;
  const inMax = input[i + 1]!;
  const outMin = output[i]!;
  const outMax = output[i + 1]!;

  assertIncreasing(inMin, inMax, i);

  // Clamp the result at the ends so eased curves still hit the endpoint value.
  if (value < inMin && extrapolateLeft === "clamp") return outMin;
  if (value > inMax && extrapolateRight === "clamp") return outMax;

  const progress = (value - inMin) / (inMax - inMin);
  const eased = easing(progress);
  return outMin + eased * (outMax - outMin);
}

function assertIncreasing(a: number, b: number, index: number): void {
  if (b <= a) {
    throw new Error(
      `interpolate: input range must be strictly increasing, but input[${index}] (${a}) >= input[${index + 1}] (${b})`,
    );
  }
}
