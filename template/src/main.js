import { mountPlayer } from "./player.js";
import { config, scene } from "./scene.js";
import "./styles.css";

const app = document.getElementById("app");
let player = mountPlayer(app, config, scene);

// Vite hot reload: when you edit the scene, tear the old player down and rebuild
// so you see changes instantly without a full page refresh.
if (import.meta.hot) {
  import.meta.hot.accept("./scene.js", (next) => {
    if (!next) return;
    player.destroy();
    player = mountPlayer(app, next.config, next.scene);
  });
}
