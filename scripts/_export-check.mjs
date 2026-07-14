import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:5199/#orbit");
await p.waitForTimeout(2000);
await p.click("text=Export MP4");
await p.waitForSelector(".status a.dl", { timeout: 240_000 });
const result = await p.evaluate(async () => {
  const url = document.querySelector(".status a.dl").href;
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const has = (needle) => {
    const enc = needle.split("").map((c) => c.charCodeAt(0));
    outer: for (let i = 0; i < buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) if (buf[i + j] !== enc[j]) continue outer;
      return true;
    }
    return false;
  };
  return { sizeKB: Math.round(buf.length / 1024), aac: has("mp4a"), soun: has("soun") };
});
console.log(JSON.stringify(result));
await b.close();
