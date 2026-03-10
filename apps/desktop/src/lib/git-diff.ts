import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  gitReadDiffRequestSchema,
  gitReadDiffResponseSchema,
  type GitDiffFile,
  type GitReadDiffRequest,
  type GitReadDiffResponse
} from "@localterm/shared";

const execFileAsync = promisify(execFile);
const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

type GitStatusEntry = {
  path: string;
  status: GitDiffFile["status"];
  isUntracked: boolean;
};

function toTrackedStatus(code: string): GitDiffFile["status"] {
  const staged = code[0] ?? " ";
  const unstaged = code[1] ?? " ";
  if (code === "??" || staged === "A" || unstaged === "A") {
    return "A";
  }
  if (staged === "D" || unstaged === "D") {
    return "D";
  }
  return "M";
}

async function runGit(
  cwd: string,
  args: string[],
  options?: {
    allowExitCodes?: number[];
  }
) {
  try {
    return await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024
    });
  } catch (error) {
    const allowExitCodes = options?.allowExitCodes ?? [];
    const code = typeof (error as { code?: unknown }).code === "number"
      ? (error as { code: number }).code
      : null;
    if (code != null && allowExitCodes.includes(code)) {
      return {
        stdout: typeof (error as { stdout?: unknown }).stdout === "string"
          ? (error as { stdout: string }).stdout
          : "",
        stderr: typeof (error as { stderr?: unknown }).stderr === "string"
          ? (error as { stderr: string }).stderr
          : ""
      };
    }
    throw error;
  }
}

async function resolveGitRepoRoot(sourcePath: string) {
  const stat = await fs.stat(sourcePath);
  const cwd = stat.isDirectory() ? sourcePath : path.dirname(sourcePath);
  const { stdout } = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

async function hasHeadCommit(repoPath: string) {
  try {
    await runGit(repoPath, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function parseStatusEntries(raw: string) {
  const entries: GitStatusEntry[] = [];
  const tokens = raw.split("\0");

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token.length < 4) continue;

    const code = token.slice(0, 2);
    let filePath = token.slice(3);

    const renameOrCopy =
      code[0] === "R" ||
      code[0] === "C" ||
      code[1] === "R" ||
      code[1] === "C";

    if (renameOrCopy) {
      const renamedPath = tokens[index + 1] ?? "";
      if (renamedPath) {
        filePath = renamedPath;
        index += 1;
      }
    }

    if (!filePath) continue;

    entries.push({
      path: filePath,
      status: toTrackedStatus(code),
      isUntracked: code === "??"
    });
  }

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function buildPatchForEntry(repoPath: string, entry: GitStatusEntry, headExists: boolean) {
  if (entry.isUntracked || (!headExists && entry.status === "A")) {
    const absolutePath = path.join(repoPath, entry.path);
    const { stdout } = await runGit(
      repoPath,
      [
        "diff",
        "--no-index",
        "--binary",
        "--no-ext-diff",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        "--",
        "/dev/null",
        absolutePath
      ],
      { allowExitCodes: [1] }
    );
    return stdout.split(absolutePath).join(entry.path);
  }

  const baseRevision = headExists ? "HEAD" : EMPTY_TREE_HASH;
  const { stdout } = await runGit(repoPath, [
    "diff",
    "--binary",
    "--no-ext-diff",
    "--find-renames",
    "--relative",
    baseRevision,
    "--",
    entry.path
  ]);
  return stdout;
}

export async function readGitDiffForPath(input: GitReadDiffRequest): Promise<GitReadDiffResponse> {
  const request = gitReadDiffRequestSchema.parse(input);
  const repoPath = await resolveGitRepoRoot(request.path);
  const headExists = await hasHeadCommit(repoPath);
  const { stdout } = await runGit(repoPath, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all"
  ]);

  const statusEntries = parseStatusEntries(stdout);
  const files = (
    await Promise.all(
      statusEntries.map(async (entry) => ({
        path: entry.path,
        status: entry.status,
        patch: await buildPatchForEntry(repoPath, entry, headExists)
      }))
    )
  ).filter((entry) => entry.patch.trim().length > 0);

  return gitReadDiffResponseSchema.parse({
    repoPath,
    files
  });
}
