import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readGitDiffForPath } from "../../apps/desktop/src/lib/git-diff";

function hasGit() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe"
  });
}

test("readGitDiffForPath loads modified deleted and untracked files", { skip: !hasGit() }, async () => {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-git-diff-"));

  try {
    git(repoPath, ["init"]);
    git(repoPath, ["config", "user.email", "e2e@example.com"]);
    git(repoPath, ["config", "user.name", "E2E"]);

    await fs.writeFile(path.join(repoPath, "tracked.txt"), "base\n", "utf8");
    await fs.writeFile(path.join(repoPath, "deleted.txt"), "delete me\n", "utf8");
    git(repoPath, ["add", "."]);
    git(repoPath, ["commit", "-m", "init"]);

    await fs.writeFile(path.join(repoPath, "tracked.txt"), "base\nnext\n", "utf8");
    await fs.rm(path.join(repoPath, "deleted.txt"));
    await fs.writeFile(path.join(repoPath, "new.txt"), "hello\n", "utf8");

    const result = await readGitDiffForPath({ path: repoPath });
    const expectedRepoPath = await fs.realpath(repoPath);

    assert.equal(result.repoPath, expectedRepoPath);

    const byPath = new Map(result.files.map((entry) => [entry.path, entry]));
    assert.equal(byPath.get("tracked.txt")?.status, "M");
    assert.equal(byPath.get("deleted.txt")?.status, "D");
    assert.equal(byPath.get("new.txt")?.status, "A");

    assert.match(byPath.get("tracked.txt")?.patch ?? "", /\+\s*next|\+next/);
    assert.match(byPath.get("deleted.txt")?.patch ?? "", /deleted\.txt/);
    assert.match(byPath.get("new.txt")?.patch ?? "", /new\.txt/);
  } finally {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});
