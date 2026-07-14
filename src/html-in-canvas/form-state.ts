// Cloned form controls carry their markup defaults, not the live value/checked/
// selected state the user has produced. Copy that state onto the clone before it
// is serialized to SVG so inputs rasterize as they currently appear.
export function syncFormState(src: HTMLElement, dst: HTMLElement): void {
  const srcFields = src.querySelectorAll("input, textarea, select, option");
  const dstFields = dst.querySelectorAll("input, textarea, select, option");
  if (srcFields.length !== dstFields.length) return;

  for (let i = 0; i < srcFields.length; i++) {
    const s = srcFields[i];
    const d = dstFields[i];
    if (!s || !d) continue;
    switch (s.tagName) {
      case "INPUT": {
        const si = s as HTMLInputElement;
        const di = d as HTMLInputElement;
        if (si.type === "checkbox" || si.type === "radio") {
          if (si.checked) di.setAttribute("checked", "");
          else di.removeAttribute("checked");
        } else {
          di.setAttribute("value", si.value);
        }
        break;
      }
      case "TEXTAREA":
        (d as HTMLTextAreaElement).textContent = (s as HTMLTextAreaElement).value;
        break;
      case "SELECT":
        (d as HTMLSelectElement).selectedIndex = (s as HTMLSelectElement).selectedIndex;
        break;
      case "OPTION":
        if ((s as HTMLOptionElement).selected) d.setAttribute("selected", "");
        else d.removeAttribute("selected");
        break;
    }
  }
}
