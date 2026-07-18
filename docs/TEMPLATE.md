# Templating

How repetition is declared in WebMotion's HTML layer. Companion to [MOTION.md](./MOTION.md) and [AUDIO.md](./AUDIO.md).

## Principles

1. **Macro expansion, not a framework.** `<w-for>` stamps real elements into the tree once, at composition setup. What runs afterwards is plain markup: the frame walk, motion, and audio machinery see ordinary elements, and devtools shows the expanded tree. There is no reactivity and no virtual DOM.
2. **No arbitrary expressions.** Placeholders evaluate a deliberately small language: data paths, numbers, and `+ - * /` arithmetic with parentheses. No function calls, no conditionals, no `eval`. Layout math (`{135 + i * 340}`) is in; everything else stays in JS, where authors using a real framework already have loops.
3. **Data is content.** Arrays live in `<w-data>` as JSON, next to the scene they drive.

## `<w-data>`: named data

```html
<w-data name="features">[
  "Deterministic to the frame.",
  "Native to the browser.",
  "Zero render farm."
]</w-data>
```

The text content is parsed as JSON once at setup. Invalid JSON logs a warning and the name resolves to nothing. `<w-data>` is inert: never rendered, skipped by the frame walk.

## Data from JS

The composition's `data` property provides the same names programmatically, merged over `<w-data>` declarations (JS wins on conflicts):

```js
const comp = document.querySelector("w-composition");
comp.data = { features: await fetchFeatures() };
```

Set it before the element connects, or in a script that runs before setup fires (setup is deferred one frame after connect). Expansion still happens exactly once; assigning `data` later has no effect, like editing a `<w-data>` after setup.

## `<w-for>`: repetition

```html
<w-for each="features" as="line">
  <w-sequence from="{6 + i * 30}">
    <w-text class="feature" motion="beat-in" x="0" y="{250 + i * 80}" width="1280">{line}</w-text>
  </w-sequence>
</w-for>
```

At setup, the children of `<w-for>` are cloned once per item, placeholders are substituted, and the clones are inserted after the `<w-for>` in document order. The `<w-for>` itself stays in the tree, inert, holding its template children.

### Attributes

| Attribute | Meaning |
| --- | --- |
| `each` | Path to an array: a `<w-data>` name, optionally with `.` / `[n]` segments into it. |
| `count` | Alternative to `each`: a number (or expression) of iterations with no item data. |
| `as` | Name the current item binds to inside the loop. Default `item`. |
| `index` | Name the zero-based index binds to. Default `i`. |

### Placeholders

Inside a `<w-for>` subtree, `{...}` in attribute values and text nodes is substituted during expansion:

- **Paths**: `{line}`, `{chip.label}`, `{rows[2].id}`. A placeholder that is a single path keeps the value's type in text (objects stringify as JSON).
- **Arithmetic**: `{6 + i * 30}`, `{(i + 1) * 80}`. Operands are numbers and paths that resolve to numbers.
- Scopes nest: an inner `<w-for>` sees its own bindings plus the outer ones; name the indexes (`index="j"`) to keep both.
- A placeholder that fails to evaluate is left as written and a warning is logged.

Outside a `<w-for>`, braces are ordinary text.

## `<w-if>`: static variant selection

```html
<w-if when="flags.pro">
  <w-sequence from="220" duration="130">...the pro feature beat...</w-sequence>
</w-if>

<w-for each="cards" as="card">
  <div class="card">{card.t}<w-if when="card.urgent"><span class="badge">urgent</span></w-if></div>
</w-for>
```

`when` is the same expression language, judged by template truthiness: `false`, `0`, `""`, `null`, and empty arrays do not render; everything else does. A name missing from the data entirely is also false, so variant flags can simply be omitted when they do not apply. Truthy stamps the children (once, like `<w-for>`); falsy stamps nothing. Combined with the `data` property, one scene renders many variants: localized cuts, plan-specific beats, per-customer exports.

There is no `w-else` and no comparison or boolean operators in `when`. A condition that needs logic (`count > 3`, negation) is computed into the data as a boolean, in JS or in the JSON. Like everything in this layer, `<w-if>` is evaluated once at setup; it does not toggle.

## Timing model

Expansion runs once, inside `<w-composition>` setup, after `template=""` instantiation and before the first frame renders. Expanded elements are ordinary scene elements from then on: motion attributes resolve, sequences shift time, `<w-audio>` clips are collected. Editing a `<w-data>`, `<w-for>`, or `<w-if>` after setup has no effect; the template layer is deliberately not live.

## What this is not

Interpolation is not a general template language: no conditionals, no filters, no event bindings, no reactivity. Scenes that need data-dependent structure beyond repetition should generate markup in JS, where every host framework's loops and conditionals already work, because the scene is just DOM.
