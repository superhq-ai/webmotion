import { demos, demoById } from "./demos/index.js";
import { mountPlayer } from "./player.js";
import "./styles.css";

const nav = document.getElementById("demo-nav");
const stage = document.getElementById("stage-mount");

// Build the sidebar list. Order comes from demos/index.js; first is default.
for (const demo of demos) {
  const item = document.createElement("button");
  item.className = "nav-item";
  item.dataset.id = demo.id;
  item.innerHTML = `<span class="nav-name"></span><span class="nav-kind"></span>`;
  item.querySelector(".nav-name").textContent = demo.title;
  item.querySelector(".nav-kind").textContent = demo.kind ?? "";
  item.addEventListener("click", () => {
    location.hash = demo.id;
  });
  nav.appendChild(item);
}

let current = null;

function select(id) {
  const demo = demoById.get(id) ?? demos[0];

  for (const el of nav.querySelectorAll(".nav-item")) {
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

// Live star count on the GitHub button; the button works fine without it, so
// failures (rate limits, offline) just leave the badge hidden.
fetch("https://api.github.com/repos/superhq-ai/webmotion")
  .then((r) => (r.ok ? r.json() : null))
  .then((repo) => {
    if (!repo || typeof repo.stargazers_count !== "number") return;
    const badge = document.getElementById("star-count");
    if (!badge) return;
    const n = repo.stargazers_count;
    badge.textContent = n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
    badge.hidden = false;
  })
  .catch(() => {});
