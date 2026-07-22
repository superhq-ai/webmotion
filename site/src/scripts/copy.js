// Copy-to-clipboard for any [data-copy] button, wherever it is rendered.
//
// Kept out of the component so the styling and the behaviour are not tied to
// one template: Astro scopes component styles, so a button written elsewhere
// would silently lose its feedback.
export function wireCopyButtons(root = document) {
  for (const btn of root.querySelectorAll("[data-copy]")) {
    if (btn.dataset.copyWired) continue;
    btn.dataset.copyWired = "1";

    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy ?? "");
        btn.dataset.state = "done";
        setTimeout(() => btn.removeAttribute("data-state"), 1400);
      } catch {
        // No clipboard access (insecure context, denied permission): put the
        // text under the caret so the keyboard shortcut still works.
        const code = btn.querySelector("code") ?? btn.parentElement?.querySelector("code");
        if (!code) return;
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
  }
}
