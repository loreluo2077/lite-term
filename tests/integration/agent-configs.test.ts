import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  listAgentConfigSnapshots,
  readAgentConfigFile,
  writeAgentConfigFile
} from "../../apps/desktop/src/lib/agent-configs";

test("agent config discovery resolves codex and claude project plus user config", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-agent-configs-"));
  const workspaceRootPath = path.join(rootDir, "workspace");
  const userHomePath = path.join(rootDir, "home");

  try {
    await fs.mkdir(path.join(workspaceRootPath, ".codex"), { recursive: true });
    await fs.mkdir(path.join(workspaceRootPath, ".claude", "skills"), { recursive: true });
    await fs.mkdir(path.join(userHomePath, ".codex", "skills"), { recursive: true });
    await fs.mkdir(path.join(userHomePath, ".claude"), { recursive: true });

    await fs.writeFile(path.join(workspaceRootPath, "AGENTS.md"), "# project instructions\n", "utf8");
    await fs.writeFile(
      path.join(workspaceRootPath, ".codex", "config.toml"),
      [
        'model = "gpt-5-codex"',
        'approval_policy = "on-request"',
        'sandbox_mode = "workspace-write"',
        '',
        '[mcp_servers.webterm]',
        'command = "node"'
      ].join("\n"),
      "utf8"
    );
    await fs.writeFile(path.join(workspaceRootPath, "CLAUDE.md"), "# Claude\n", "utf8");
    await fs.writeFile(
      path.join(workspaceRootPath, ".claude", "settings.json"),
      JSON.stringify(
        {
          model: "claude-sonnet-4",
          mcpServers: {
            webterm: {
              command: "node"
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );
    await fs.writeFile(
      path.join(userHomePath, ".codex", "config.toml"),
      'model = "gpt-4.1"\n',
      "utf8"
    );
    await fs.writeFile(
      path.join(userHomePath, ".claude", "settings.json"),
      JSON.stringify({ model: "claude-opus-4.1", skillsPath: "~/.claude/skills" }, null, 2),
      "utf8"
    );

    const response = await listAgentConfigSnapshots({ workspaceRootPath, userHomePath });
    const codex = response.snapshots.find((entry) => entry.agent === "codex");
    const claude = response.snapshots.find((entry) => entry.agent === "claude_code");

    assert.ok(codex);
    assert.ok(claude);
    assert.equal(codex?.resolved.model, "gpt-5-codex");
    assert.equal(codex?.resolved.approvalMode, "on-request");
    assert.equal(codex?.resolved.sandboxMode, "workspace-write");
    assert.deepEqual(codex?.resolved.mcpServers, ["webterm"]);
    assert.ok(codex?.files.some((entry) => entry.path.endsWith(".codex/skills") && entry.exists));

    assert.equal(claude?.resolved.model, "claude-sonnet-4");
    assert.deepEqual(claude?.resolved.mcpServers, ["webterm"]);
    assert.ok(claude?.files.some((entry) => entry.path.endsWith(".claude/settings.json") && entry.exists));
    assert.ok(claude?.files.some((entry) => entry.path.endsWith(".claude/skills") && entry.entryType === "directory"));
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test("agent config files can be read and written", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-agent-config-file-"));
  const targetPath = path.join(rootDir, ".codex", "config.toml");

  try {
    const missingRead = await readAgentConfigFile(targetPath);
    assert.equal(missingRead.content, "");
    assert.equal(missingRead.truncated, false);

    await writeAgentConfigFile(targetPath, 'model = "gpt-5"\n');
    const existingRead = await readAgentConfigFile(targetPath);
    assert.equal(existingRead.content, 'model = "gpt-5"\n');
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});
