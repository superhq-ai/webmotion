# Motion

How animation is declared in WebMotion's HTML layer. This is the specification for `<w-animate>`, `<w-defs>`, `<w-animation>`, and the `motion` attribute.

## Principles

1. **Everything is a pure function of the frame.** A tween's output at frame N depends only on N and the tween's declared fields. Nothing reads the wall clock.
2. **With HTML's grain.** A tween is a thing with typed fields, so it is an element with attributes, not a microsyntax packed into a string. Anything an author writes can be found with `querySelector`, edited with `setAttribute`, and inspected in devtools.
3. **Definition and application are separate layers**, deliberately mirroring CSS. Inline tweens are the `style=""` of the system; named animations in `<w-defs>` are the stylesheet.
4. **Time is structure.** Instances are staggered by placing them in `<w-sequence>` windows, not by per-instance delay parameters. Definitions are always authored in local time starting at frame 0.

## `<w-animate>`: one tween

A `<w-animate>` element declares one interpolation of one property over a frame window. It renders nothing (it is `display: none`) and animates its **parent** entity when written inline, or the **referencing** entity when part of a named definition.

```html
<w-text x="0" y="250" width="1280" align="center" font="700 96px system-ui" color="#f5f6f8">
  Author in HTML.
  <w-animate property="opacity" from="0"  to="1" start="0" end="18" easing="easeOutCubic"></w-animate>
  <w-animate property="y"       from="40" to="0" start="0" end="18" easing="easeOutCubic"></w-animate>
</w-text>
```

### Attributes

| Attribute | Default | Meaning |
| --- | --- | --- |
| `property` | `opacity` | What to animate. `x`, `y`, `scale`, `rotate`, and `opacity` are composed specially (below). Anything else is written to the element's style as `value + unit` (e.g. `property="border-radius" to="20px"`). |
| `from` | `0` | Start value. May carry a unit (`40px`, `-12deg`). |
| `to` | `0` | End value. Its unit wins over `from`'s. |
| `start` | `0` | First frame of the window, in the local frame space of the nearest enclosing `<w-sequence>`. |
| `end` | `0` | Last frame of the window. |
| `easing` | `linear` | A named easing from the animation module (`easeOutCubic`, `easeInOutSine`, ...). Unknown names fall back to `linear`. |

Outside `[start, end]` the value clamps to the boundary value. All frame numbers are integers in local frame space; a tween inside `<w-sequence from="12">` starting at `start="0"` begins at composition frame 12.

### Composition of animated properties

Per frame, per entity: `x`, `y`, `scale`, and `rotate` accumulate into a single CSS transform (`translate(x, y) scale(s) rotate(r)`), and `opacity` replaces the entity's base opacity. When several tweens target the same property in the same frame, the **last applied wins** (application order is defined below). Other properties are independent style writes.

## `<w-defs>` and `<w-animation>`: named definitions

A `<w-defs>` element is an inert container (never rendered, skipped by the frame walk). It holds `<w-animation name="...">` definitions, each of which groups one or more `<w-animate>` tweens:

```html
<w-defs>
  <w-animation name="fade-up">
    <w-animate property="opacity" from="0"  to="1" start="0" end="18" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="40" to="0" start="0" end="18" easing="easeOutCubic"></w-animate>
  </w-animation>
  <w-animation name="pop-in">
    <w-animate property="opacity" from="0"   to="1" start="0" end="12" easing="easeOutCubic"></w-animate>
    <w-animate property="scale"   from="0.9" to="1" start="0" end="12" easing="easeOutCubic"></w-animate>
  </w-animation>
</w-defs>
```

Definitions are authored in local time starting at frame 0. They own no placement; where and when they run is the referencing element's business.

## `motion`: applying definitions

Entities reference definitions with the `motion` attribute, space-separated like `class`:

```html
<w-text motion="fade-up">Author in HTML.</w-text>
<w-rect motion="pop-in spin" ...></w-rect>
```

### Resolution and scoping

For each name, the definition is resolved by walking up from the referencing element: at each ancestor, its direct `<w-defs>` children are checked for a matching `<w-animation name>`. The first match wins, so inner scopes shadow outer ones. If no ancestor scope matches, the document is searched as a final fallback. Unresolved names are ignored silently (like an unknown class).

A `<w-defs>` placed inside a `<w-composition>` scopes its vocabulary to that composition, which keeps compositions self-contained and copy-pasteable.

### Application order and conflicts

Tweens apply to an entity in this order, and within a frame the last write to a property wins:

1. Each name in `motion`, left to right; within a definition, its `<w-animate>` children in document order.
2. The entity's inline `<w-animate>` children, in document order.

So inline tweens override named ones, mirroring `style=""` beating a stylesheet.

Note that a tween writes its clamped boundary value even outside its window, so two tweens on the same property of one element conflict across the whole timeline, not just where they overlap. For entrance and exit on the same property, put them on different nesting levels (a wrapper element owns the exit, the inner element owns the entrance); opacity and transforms compose through the tree. Window-scoped precedence (the most recently started tween owning the property) is a candidate refinement, reserved for later.

## Staggering

There is no delay parameter. To run the same animation at different times, place instances inside sequences; the sequence shifts the frame origin, and the definition still starts at its local frame 0:

```html
<w-sequence from="70">
  <w-sequence from="0"><w-text motion="pop-in">first</w-text></w-sequence>
  <w-sequence from="8"><w-text motion="pop-in">second</w-text></w-sequence>
  <w-sequence from="16"><w-text motion="pop-in">third</w-text></w-sequence>
</w-sequence>
```

This is a deliberate constraint: when time lives in the tree structure, the timeline is readable from markup alone.

## Liveness

All motion attributes are live. Changing any attribute of a `<w-animate>`, renaming a `<w-animation>`, moving elements, or editing `motion` takes effect on the next rendered frame; parsed tween data is cached per element and invalidated by attribute value comparison, never by time. Editing the scene in devtools while scrubbing behaves the way you would hope.

## Text content

Entities render their text from child text nodes, so tween elements and text coexist naturally. `<w-text text="...">` is also supported; it writes into a dedicated inner span and leaves element children (such as inline tweens) untouched.

## Styling

Static presentation belongs to CSS, not to motion vocabulary. The test is simple: if a value changes with the frame, it is a tween; if it is the same at every frame, it is a style. Entities are ordinary elements, so everything CSS offers works on them, in live preview and in export alike (the rasterizer embeds the document's stylesheets):

```html
<style>
  w-composition { font-family: -apple-system, "SF Pro Display", sans-serif; }
  .headline { font-size: 96px; font-weight: 700; text-align: center; color: #f5f6f8; }
</style>

<w-composition ...>
  <w-text class="headline" motion="fade-up" x="0" y="250" width="1280">Author in HTML.</w-text>
</w-composition>
```

- **Inheritance**: `font-family` and `color` inherit, so set them once on the composition (or any wrapper).
- **Classes** name repeated visual roles, the way `motion` names repeated behavior.
- **Custom properties** work as design tokens when scenes want themes.

The presentational attributes on entities (`font`, `color`, `fill`, `radius`, `align`) are one-off conveniences on the same tier as inline `style`; reach for classes when a role repeats. WebMotion deliberately adds no font or style vocabulary of its own.

## Extending

Custom per-frame behaviors register from JS through the component registry, unchanged:

```js
import { registerComponent, setAnimatedProp } from "@superhq/webmotion/elements";

registerComponent("pulse", {
  parse: (value) => ({ speed: Number(value) || 1 }),
  render(el, data, ctx) {
    setAnimatedProp(el, "scale", 1 + 0.1 * Math.sin((ctx.frame / ctx.fps) * data.speed * Math.PI * 2), "");
  },
});
```

Attribute components are the JS escape hatch; `<w-animate>` is the canonical authoring surface.

## Reserved for later

- **Value parameters**: definitions reading CSS custom properties (`from="var(--rise)"`), so instances can vary magnitude without new syntax.
- **Keyframes**: multi-stop tweens, either as repeated `<w-animate>` windows or a `<w-keyframe>` child vocabulary.
- **`<w-use>` of whole subtrees** is intentionally out of scope; `motion` references behavior, not structure.

## History

Replaces the A-Frame style string DSL (`animate__id="property: opacity; from: 0; ..."`) that shipped unreleased in early 0.0.x. Removed rather than deprecated; the component registry it rode on remains as the JS extension API.
