type XtermCache = {
  Terminal?: typeof import("@xterm/xterm").Terminal;
  FitAddon?: typeof import("@xterm/addon-fit").FitAddon;
  AttachAddon?: typeof import("@xterm/addon-attach").AttachAddon;
  WebLinksAddon?: typeof import("@xterm/addon-web-links").WebLinksAddon;
  CanvasAddon?: typeof import("@xterm/addon-canvas").CanvasAddon;
  WebglAddon?: typeof import("@xterm/addon-webgl").WebglAddon;
  SearchAddon?: typeof import("@xterm/addon-search").SearchAddon;
  LigaturesAddon?: typeof import("@xterm/addon-ligatures").LigaturesAddon;
  Unicode11Addon?: typeof import("@xterm/addon-unicode11").Unicode11Addon;
};

const cache: XtermCache = {};

async function once<K extends keyof XtermCache>(
  key: K,
  load: () => Promise<NonNullable<XtermCache[K]>>
): Promise<NonNullable<XtermCache[K]>> {
  if (cache[key]) return cache[key] as NonNullable<XtermCache[K]>;
  const value = await load();
  cache[key] = value;
  return value;
}

export async function loadTerminal() {
  return once("Terminal", async () => {
    const mod = await import("@xterm/xterm");
    return mod.Terminal;
  });
}

export async function loadFitAddon() {
  return once("FitAddon", async () => {
    const mod = await import("@xterm/addon-fit");
    return mod.FitAddon;
  });
}

export async function loadAttachAddon() {
  return once("AttachAddon", async () => {
    const mod = await import("@xterm/addon-attach");
    return mod.AttachAddon;
  });
}

export async function loadWebLinksAddon() {
  return once("WebLinksAddon", async () => {
    const mod = await import("@xterm/addon-web-links");
    return mod.WebLinksAddon;
  });
}

export async function loadCanvasAddon() {
  return once("CanvasAddon", async () => {
    const mod = await import("@xterm/addon-canvas");
    return mod.CanvasAddon;
  });
}

export async function loadWebglAddon() {
  return once("WebglAddon", async () => {
    const mod = await import("@xterm/addon-webgl");
    return mod.WebglAddon;
  });
}

export async function loadSearchAddon() {
  return once("SearchAddon", async () => {
    const mod = await import("@xterm/addon-search");
    return mod.SearchAddon;
  });
}

export async function loadLigaturesAddon() {
  return once("LigaturesAddon", async () => {
    const mod = await import("@xterm/addon-ligatures");
    return mod.LigaturesAddon;
  });
}

export async function loadUnicode11Addon() {
  return once("Unicode11Addon", async () => {
    const mod = await import("@xterm/addon-unicode11");
    return mod.Unicode11Addon;
  });
}
