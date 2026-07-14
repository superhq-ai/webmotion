// Small DOM helpers the rasterizer depends on, kept in-tree so the module has
// no third-party utility dependency. The logic is derived from repalash's
// ts-browser-helpers (MIT); see CREDITS.md.

// Load a URL into an image element, resolving once it has decoded. crossOrigin
// is set so images drawn into the SVG do not taint the output canvas.
export function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.decoding = "sync";
    img.src = url;
  });
}

// Tagged-template helper that returns the raw string. Used to keep CSS blocks
// readable and syntax highlighted at the call site.
export function css(strings: TemplateStringsArray, ...rest: unknown[]): string {
  return String.raw({ raw: strings }, ...(rest as string[]));
}

// Replace absolute http(s)/ftp URLs found in a stylesheet string with the data
// URLs returned by `downloader`, so external references become self contained.
export async function embedUrlRefs(
  str: string,
  downloader: (url: string) => Promise<string>,
): Promise<string> {
  const urls = str.match(/(((ftp|https?):\/\/)[\-\w@:%_\+.~#?,&\/\/=]+)/g);
  if (!urls) return str;
  for (const url of urls) {
    const dataUrl = await downloader(url);
    str = str.replace(url, dataUrl);
  }
  return str;
}
