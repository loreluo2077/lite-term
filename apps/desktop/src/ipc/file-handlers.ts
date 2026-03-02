import fs from "node:fs/promises";
import path from "node:path";
import { dialog, ipcMain } from "electron";
import {
  IPC_CHANNELS,
  fsPickDirectoryResponseSchema,
  fsPickFileRequestSchema,
  fsPickFileResponseSchema,
  fsReadDirRequestSchema,
  fsReadDirResponseSchema,
  fsReadFileRequestSchema,
  fsReadFileResponseSchema
} from "@localterm/shared";

const DEFAULT_READ_FILE_MAX_BYTES = 1024 * 1024;

function isHidden(name: string) {
  return name.startsWith(".");
}

function sortEntriesByKindAndName<T extends { kind: "file" | "directory"; name: string }>(entries: T[]) {
  return entries.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

export function registerFileIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.filePickDirectory, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    const selectedPath = result.canceled ? null : (result.filePaths[0] ?? null);
    return fsPickDirectoryResponseSchema.parse({
      path: selectedPath
    });
  });

  ipcMain.handle(IPC_CHANNELS.filePickFile, async (_event, payload) => {
    const request = fsPickFileRequestSchema.parse(payload ?? {});
    const options: {
      properties: ["openFile"];
      filters?: { name: string; extensions: string[] }[];
    } = {
      properties: ["openFile"]
    };
    if (request.filters) {
      options.filters = request.filters;
    }
    const result = await dialog.showOpenDialog(options);
    const selectedPath = result.canceled ? null : (result.filePaths[0] ?? null);
    return fsPickFileResponseSchema.parse({
      path: selectedPath
    });
  });

  ipcMain.handle(IPC_CHANNELS.fileReadDir, async (_event, payload) => {
    const request = fsReadDirRequestSchema.parse(payload);
    const includeHidden = request.includeHidden ?? false;
    const entries = await fs.readdir(request.dirPath, { withFileTypes: true });
    const mapped = await Promise.all(
      entries
        .filter((entry) => includeHidden || !isHidden(entry.name))
        .map(async (entry) => {
          const fullPath = path.join(request.dirPath, entry.name);
          if (entry.isDirectory()) {
            return {
              name: entry.name,
              path: fullPath,
              kind: "directory" as const,
              size: null
            };
          }

          let size: number | null = null;
          try {
            const stat = await fs.stat(fullPath);
            size = stat.size;
          } catch {
            size = null;
          }

          return {
            name: entry.name,
            path: fullPath,
            kind: "file" as const,
            size
          };
        })
    );

    return fsReadDirResponseSchema.parse({
      dirPath: request.dirPath,
      entries: sortEntriesByKindAndName(mapped)
    });
  });

  ipcMain.handle(IPC_CHANNELS.fileReadFile, async (_event, payload) => {
    const request = fsReadFileRequestSchema.parse(payload);
    const maxBytes = request.maxBytes ?? DEFAULT_READ_FILE_MAX_BYTES;
    const contentBuffer = await fs.readFile(request.filePath);
    const truncated = contentBuffer.byteLength > maxBytes;
    const finalBuffer = truncated ? contentBuffer.subarray(0, maxBytes) : contentBuffer;
    return fsReadFileResponseSchema.parse({
      filePath: request.filePath,
      content: finalBuffer.toString("utf8"),
      truncated
    });
  });
}
