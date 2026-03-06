import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, protocol } from "electron";

const EXTENSION_SCHEME = "localterm-extension";
const EXTENSION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const SOURCE_EXTENSIONS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../extensions"
);
const extensionRootCache = new Map<string, string>();

protocol.registerSchemesAsPrivileged([
  {
    scheme: EXTENSION_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

function guessContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

function ensureSafePath(rootDir: string, requestedPath: string) {
  const normalized = requestedPath.replace(/^\/+/, "");
  const requested = normalized.length === 0 || normalized.endsWith("/")
    ? `${normalized}index.html`
    : normalized;
  const resolved = path.resolve(rootDir, requested);
  const safePrefix = `${rootDir}${path.sep}`;
  if (resolved !== rootDir && !resolved.startsWith(safePrefix)) {
    return null;
  }
  return resolved;
}

function collectAncestorExtensionRoots(startDir: string, extensionId: string) {
  const roots: string[] = [];
  let current = path.resolve(startDir);
  const visited = new Set<string>();
  while (!visited.has(current)) {
    visited.add(current);
    roots.push(path.resolve(current, "extensions", extensionId));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return roots;
}

async function resolveExtensionFilePath(extensionId: string, requestPath: string) {
  const cachedRoot = extensionRootCache.get(extensionId);
  if (cachedRoot) {
    const target = ensureSafePath(cachedRoot, requestPath);
    if (target) {
      try {
        const stat = await fs.stat(target);
        if (stat.isFile()) {
          return target;
        }
      } catch {
        // cache miss; continue resolving and refresh cache
      }
    }
  }

  const envRoot = process.env.LOCALTERM_EXTENSION_ROOT?.trim();
  const candidates = [
    ...(envRoot ? [path.resolve(envRoot, extensionId)] : []),
    path.resolve(process.cwd(), "extensions", extensionId),
    path.resolve(app.getAppPath(), "extensions", extensionId),
    path.resolve(path.dirname(app.getAppPath()), "extensions", extensionId),
    path.resolve(SOURCE_EXTENSIONS_ROOT, extensionId),
    ...collectAncestorExtensionRoots(process.cwd(), extensionId),
    ...collectAncestorExtensionRoots(app.getAppPath(), extensionId),
    path.resolve(app.getPath("userData"), "extensions", extensionId)
  ];
  const roots = [...new Set(candidates)];

  for (const root of roots) {
    const target = ensureSafePath(root, requestPath);
    if (!target) continue;
    try {
      const stat = await fs.stat(target);
      if (stat.isFile()) {
        extensionRootCache.set(extensionId, root);
        return target;
      }
      if (stat.isDirectory()) {
        const indexTarget = path.resolve(target, "index.html");
        const indexStat = await fs.stat(indexTarget);
        if (indexStat.isFile()) {
          extensionRootCache.set(extensionId, root);
          return indexTarget;
        }
      }
    } catch {
      // continue lookup
    }
  }

  console.warn(`[extension-protocol] not found: ${extensionId}${requestPath} roots=${roots.join(", ")}`);
  return null;
}

function isValidExtensionId(extensionId: string) {
  return EXTENSION_ID_PATTERN.test(extensionId);
}

export function registerExtensionProtocol() {
  protocol.handle(EXTENSION_SCHEME, async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response("bad request", { status: 400 });
    }

    let extensionId = "";
    try {
      extensionId = decodeURIComponent(url.hostname).trim();
    } catch {
      return new Response("bad request", { status: 400 });
    }
    if (!extensionId) {
      return new Response("extension id missing", { status: 400 });
    }
    if (!isValidExtensionId(extensionId)) {
      return new Response("invalid extension id", { status: 400 });
    }

    let requestPath = "";
    try {
      requestPath = decodeURIComponent(url.pathname);
    } catch {
      return new Response("bad request", { status: 400 });
    }

    const target = await resolveExtensionFilePath(extensionId, requestPath);
    if (!target) {
      return new Response("not found", { status: 404 });
    }

    const content = await fs.readFile(target);
    return new Response(content, {
      status: 200,
      headers: {
        "content-type": guessContentType(target),
        "cache-control": "no-cache"
      }
    });
  });
}
