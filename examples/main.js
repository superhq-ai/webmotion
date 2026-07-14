import { demos, demoById } from "./demos/index.js";
import { mountPlayer } from "./player.js";
import "./styles.css";

const nav = document.getElementById("demo-nav");
const stage = document.getElementById("stage-mount");

// Build the segmented tab control.
for (const demo of demos) {
  const tab = document.createElement("button");
  tab.className = "tab";
  tab.dataset.id = demo.id;
  tab.textContent = demo.title;
  tab.addEventListener("click", () => {
    location.hash = demo.id;
  });
  nav.appendChild(tab);
}

let current = null;

function select(id) {
  const demo = demoById.get(id) ?? demos[0];

  for (const el of nav.querySelectorAll(".tab")) {
    el.classList.toggle("active", el.dataset.id === demo.id);
  }

  if (current) current.destroy();
  current = mountPlayer(stage, demo);
}

function fromHash() {
  const id = location.hash.replace(/^#/, "");
  select(demoById.has(id) ? id : demos[0].id);
}

window.addEventListener("hashchange", fromHash);

// Deep link to the requested demo, or fall back to the first one.
if (!location.hash) location.hash = demos[0].id;
else fromHash();
