import type { WebMotionComponent } from "../core/component.js";
import { Sequence } from "../core/sequence.js";

/**
 * Binds a component to a sequence in the timeline.
 */
export interface LayerConfig {
  /** The content to render. */
  component: WebMotionComponent;
  /** When and for how long the content is on screen. Defaults to always. */
  sequence?: Sequence;
  /** Optional human-readable name, useful for debugging and tooling. */
  name?: string;
}

export class Layer {
  readonly component: WebMotionComponent;
  readonly sequence: Sequence;
  readonly name: string | undefined;
  /** Whether `mount` has run. The runtime mounts lazily on first activation. */
  private mounted = false;

  constructor(config: LayerConfig) {
    this.component = config.component;
    this.sequence = config.sequence ?? new Sequence();
    this.name = config.name;
  }

  /** @internal */
  get isMounted(): boolean {
    return this.mounted;
  }

  /** @internal */
  markMounted(): void {
    this.mounted = true;
  }
}
