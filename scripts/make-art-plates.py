#!/usr/bin/env python3
"""Fetch and dither the public domain plates used by the site's hero film.

The originals are Leonardo works held on Wikimedia Commons, all public domain:
faithful reproductions of two-dimensional art by an artist five centuries dead,
so there is no attribution requirement. Provenance is recorded in
site/public/assets/CREDITS.md regardless.

Each plate is reduced to greyscale, contrast-adjusted, Floyd-Steinberg dithered
to one bit at half its final width, then nearest-neighbour doubled. Dithering
small and scaling up keeps the dot pattern coarse enough to survive the
composition's own downscale, which a dither at final size would not. Output is
ink on transparency, so the plates sit on whatever the scene puts behind them.

    python3 scripts/make-art-plates.py

Requires Pillow.
"""
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

OUT = Path("site/public/assets/art")
HEADERS = {"User-Agent": "webmotion-site/0.1 (https://github.com/superhq-ai/webmotion)"}
INK = (232, 232, 232)

WORKS = {
    "mona": dict(
        title="File:Mona Lisa, by Leonardo da Vinci, from C2RMF retouched.jpg",
        width=300, contrast=1.55, invert=False,
    ),
    "vitruvian": dict(
        title="File:Da Vinci Vitruve Luc Viatour.jpg",
        # Ink on pale parchment, so it inverts to read as light on dark.
        width=340, contrast=1.30, invert=True,
    ),
    "ermine": dict(
        title="File:Leonardo da Vinci - Lady with an Ermine.jpg",
        width=300, contrast=1.45, invert=False,
    ),
}


def commons_urls(titles):
    query = urllib.parse.urlencode({
        "action": "query", "format": "json", "prop": "imageinfo",
        "iiprop": "url", "iiurlwidth": "800", "titles": "|".join(titles),
    })
    req = urllib.request.Request(
        "https://commons.wikimedia.org/w/api.php?" + query, headers=HEADERS
    )
    pages = json.load(urllib.request.urlopen(req, timeout=60))["query"]["pages"]
    return {p["title"]: p["imageinfo"][0] for p in pages.values() if p.get("imageinfo")}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    info = commons_urls([w["title"] for w in WORKS.values()])

    for name, cfg in WORKS.items():
        entry = info[cfg["title"]]
        url = entry.get("thumburl") or entry["url"]
        req = urllib.request.Request(url, headers=HEADERS)
        source = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=120).read()))

        grey = source.convert("L")
        if cfg["invert"]:
            grey = ImageOps.invert(grey)

        half = cfg["width"] // 2
        grey = grey.resize((half, round(grey.height * half / grey.width)), Image.LANCZOS)
        grey = ImageEnhance.Contrast(grey).enhance(cfg["contrast"])

        dithered = grey.convert("1").resize(
            (cfg["width"], grey.height * 2), Image.NEAREST
        )

        plate = Image.new("RGBA", dithered.size, INK + (0,))
        plate.putalpha(dithered.convert("L"))
        path = OUT / f"{name}.png"
        plate.save(path, optimize=True)
        print(f"{name:10} {plate.size[0]}x{plate.size[1]}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
