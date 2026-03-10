import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getWorkspaceStorageInfo,
  readGlobalLibrary,
  removeGlobalLibrary,
  writeGlobalLibrary
} from "../../apps/desktop/src/lib/global-library-storage";

test("global library storage persists snippets todos and terminal presets under userData", async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-global-library-"));

  try {
    await writeGlobalLibrary(userDataDir, "command-snippets", [{ id: "snippet-1", title: "A" }]);
    await writeGlobalLibrary(userDataDir, "todos", [{ id: "todo-1", text: "B" }]);
    await writeGlobalLibrary(userDataDir, "terminal-startup-presets", [{ id: "preset-1", name: "C" }]);

    assert.deepEqual((await readGlobalLibrary(userDataDir, "command-snippets")).value, [
      { id: "snippet-1", title: "A" }
    ]);
    assert.deepEqual((await readGlobalLibrary(userDataDir, "todos")).value, [
      { id: "todo-1", text: "B" }
    ]);
    assert.deepEqual((await readGlobalLibrary(userDataDir, "terminal-startup-presets")).value, [
      { id: "preset-1", name: "C" }
    ]);

    const info = getWorkspaceStorageInfo(userDataDir);
    assert.match(info.commandSnippetsPath, /workspace-store/);
    assert.match(info.todosPath, /workspace-store/);
    assert.match(info.terminalStartupPresetsPath, /workspace-store/);

    await removeGlobalLibrary(userDataDir, "todos");
    assert.equal((await readGlobalLibrary(userDataDir, "todos")).value, null);
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
