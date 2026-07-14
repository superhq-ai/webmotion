// Macro expansion for <w-data> and <w-for>, run once at composition setup.
// Placeholders evaluate a closed little language: data paths, numbers, and
// + - * / arithmetic. No eval, no calls. See docs/TEMPLATE.md.

type Scope = Record<string, unknown>;

// ---- Expression evaluation ----

type Token =
  | { kind: "num"; value: number }
  | { kind: "ident"; name: string }
  | { kind: "op"; op: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i));
      if (!m) throw new Error(`bad number at ${i}`);
      tokens.push({ kind: "num", value: Number.parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      // A whole path is one token: ident(.ident | [digits])*
      const m = /^[A-Za-z_$][\w$]*(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[[0-9]+\]))*/.exec(src.slice(i));
      if (!m) throw new Error(`bad path at ${i}`);
      tokens.push({ kind: "ident", name: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ kind: "op", op: ch });
      i++;
      continue;
    }
    throw new Error(`unexpected "${ch}"`);
  }
  return tokens;
}

function resolvePath(path: string, scopes: Scope[]): unknown {
  const segments = path
    .replace(/\[([0-9]+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  const head = segments[0] as string;
  const scope = scopes.find((s) => head in s);
  if (!scope) throw new Error(`unknown name "${head}"`);
  let value: unknown = scope[head];
  for (const segment of segments.slice(1)) {
    if (value == null || typeof value !== "object") {
      throw new Error(`cannot read "${segment}" of ${String(value)}`);
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

export function evaluate(expr: string, scopes: Scope[]): unknown {
  const tokens = tokenize(expr);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const takeOp = (ops: string): string | null => {
    const t = tokens[pos];
    if (t && t.kind === "op" && ops.includes(t.op)) {
      pos++;
      return t.op;
    }
    return null;
  };

  const num = (v: unknown, what: string): number => {
    const n = typeof v === "number" ? v : Number.NaN;
    if (!Number.isFinite(n)) throw new Error(`${what} is not a number`);
    return n;
  };

  function factor(): unknown {
    if (takeOp("-")) return -num(factor(), "operand");
    if (takeOp("(")) {
      const v = sum();
      if (!takeOp(")")) throw new Error("missing )");
      return v;
    }
    const t = tokens[pos];
    if (t?.kind === "num") {
      pos++;
      return t.value;
    }
    if (t?.kind === "ident") {
      pos++;
      return resolvePath(t.name, scopes);
    }
    throw new Error("expected value");
  }

  function product(): unknown {
    let v = factor();
    for (;;) {
      const op = takeOp("*/");
      if (!op) return v;
      const r = factor();
      v = op === "*" ? num(v, "operand") * num(r, "operand") : num(v, "operand") / num(r, "operand");
    }
  }

  function sum(): unknown {
    let v = product();
    for (;;) {
      const op = takeOp("+-");
      if (!op) return v;
      const r = product();
      v = op === "+" ? num(v, "operand") + num(r, "operand") : num(v, "operand") - num(r, "operand");
    }
  }

  const value = sum();
  if (peek()) throw new Error("trailing input");
  return value;
}

// ---- Substitution ----

const PLACEHOLDER = /\{([^{}]+)\}/g;

function substituteString(text: string, scopes: Scope[]): string {
  return text.replace(PLACEHOLDER, (whole, expr: string) => {
    try {
      const value = evaluate(expr.trim(), scopes);
      if (value != null && typeof value === "object") return JSON.stringify(value);
      return String(value);
    } catch (e) {
      console.warn(`[webmotion] template placeholder ${whole}:`, (e as Error).message);
      return whole;
    }
  });
}

function substituteTree(node: Node, scopes: Scope[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (text.includes("{")) node.textContent = substituteString(text, scopes);
    return;
  }
  if (!(node instanceof Element)) return;
  for (const attr of Array.from(node.attributes)) {
    if (attr.value.includes("{")) {
      node.setAttribute(attr.name, substituteString(attr.value, scopes));
    }
  }
  // A nested <w-for>'s subtree is template content: its placeholders reference
  // bindings that only exist when it expands, so only its attributes (each,
  // count) are substituted now.
  if (node.tagName === "W-FOR") return;
  for (const child of Array.from(node.childNodes)) {
    substituteTree(child, scopes);
  }
}

// ---- Expansion ----

function collectData(root: Element): Scope {
  const scope: Scope = {};
  for (const el of Array.from(root.querySelectorAll("w-data"))) {
    const name = el.getAttribute("name");
    if (!name) continue;
    try {
      scope[name] = JSON.parse(el.textContent ?? "");
    } catch (e) {
      console.warn(`[webmotion] <w-data name="${name}"> is not valid JSON:`, (e as Error).message);
    }
  }
  return scope;
}

function expandFor(el: Element, scopes: Scope[]): void {
  const as = el.getAttribute("as") ?? "item";
  const indexName = el.getAttribute("index") ?? "i";

  let items: unknown[];
  const each = el.getAttribute("each");
  if (each) {
    let value: unknown;
    try {
      value = evaluate(each.trim(), scopes);
    } catch (e) {
      console.warn(`[webmotion] <w-for each="${each}">:`, (e as Error).message);
      return;
    }
    if (!Array.isArray(value)) {
      console.warn(`[webmotion] <w-for each="${each}"> did not resolve to an array`);
      return;
    }
    items = value;
  } else {
    const countAttr = el.getAttribute("count") ?? "0";
    let count: unknown;
    try {
      count = evaluate(countAttr.trim(), scopes);
    } catch (e) {
      console.warn(`[webmotion] <w-for count="${countAttr}">:`, (e as Error).message);
      return;
    }
    items = Array.from({ length: Math.max(0, Math.floor(Number(count))) }, () => undefined);
  }

  let anchor: ChildNode = el;
  items.forEach((item, index) => {
    const iterationScopes = [{ [as]: item, [indexName]: index }, ...scopes];
    for (const child of Array.from(el.childNodes)) {
      const clone = child.cloneNode(true);
      substituteTree(clone, iterationScopes);
      anchor.after(clone);
      anchor = clone as ChildNode;
      // Depth first, so inner loops see this iteration's bindings.
      if (clone instanceof Element) {
        for (const nested of collectFors(clone)) expandFor(nested, iterationScopes);
        if (clone.tagName === "W-FOR") expandFor(clone, iterationScopes);
      }
    }
  });
}

// Direct and nested <w-for> elements of a subtree, outermost only; inner ones
// are handled by their outer loop's expansion.
function collectFors(root: Element): Element[] {
  const out: Element[] = [];
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      if (child.tagName === "W-FOR") out.push(child);
      else walk(child);
    }
  };
  walk(root);
  return out;
}

/**
 * Expand every <w-for> under `root` against the <w-data> declared there. Runs
 * once at composition setup; the expanded elements are ordinary scene content.
 */
export function expandTemplates(root: Element): void {
  const scopes: Scope[] = [collectData(root)];
  for (const el of collectFors(root)) expandFor(el, scopes);
}
