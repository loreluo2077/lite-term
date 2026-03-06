/**
 * Window creation is isolated from session logic on purpose.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow } from "electron";

async function wait(ms: number) {
  return await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function loadUrlWithRetry(win: BrowserWindow, url: string, retries = 20) {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      await win.loadURL(url);
      return;
    } catch (error) {
      lastError = error;
      await wait(200);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function createMainWindow() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const preloadPath = path.resolve(__dirname, "../preload/runtime.cjs");

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      preload: preloadPath
    }
  });

  const rendererUrl = process.env.LOCALTERM_RENDERER_URL;
  if (rendererUrl) {
    await loadUrlWithRetry(win, rendererUrl);
   // win.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexHtml = path.resolve(__dirname, "../../../renderer/dist/index.html");
    await win.loadFile(indexHtml);
  }
}
