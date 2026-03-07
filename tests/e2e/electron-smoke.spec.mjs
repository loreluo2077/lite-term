import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { _electron as electron, expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");

const rendererUrl = process.env.LOCALTERM_RENDERER_URL ?? "http://127.0.0.1:4173";
const humanReviewRoot = path.resolve(process.cwd(), "output/playwright/human-report");

let app;
let page;
let tempHomeDir = "";
let humanState = null;

const humanCaseRecords = [];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactTextPattern(value) {
  return new RegExp(`^${escapeRegExp(value)}$`);
}

function safeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function shortHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 8);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForMainWindow(appHandle) {
  for (let i = 0; i < 30; i++) {
    const mainWindow = appHandle
      .windows()
      .find((candidate) => candidate.url().startsWith(rendererUrl));
    if (mainWindow) {
      return mainWindow;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("main window was not found");
}

async function captureHumanSnapshot(pageHandle, testInfo, label) {
  if (!humanState || !pageHandle || pageHandle.isClosed()) return;
  humanState.stepIndex += 1;
  const stepNo = String(humanState.stepIndex).padStart(2, "0");
  const nameSlug = safeSlug(label) || "step";
  const fileName = `${stepNo}-${nameSlug}.png`;
  const outputPath = testInfo.outputPath(fileName);
  await pageHandle.screenshot({ path: outputPath, fullPage: true });
  humanState.snapshots.push({
    index: humanState.stepIndex,
    label,
    fileName,
    outputPath
  });
  await testInfo.attach(`step-${stepNo}`, {
    path: outputPath,
    contentType: "image/png"
  });
}

async function runHumanStep(pageHandle, testInfo, label, action) {
  await test.step(label, async () => {
    try {
      await action();
      await captureHumanSnapshot(pageHandle, testInfo, label);
    } catch (error) {
      await captureHumanSnapshot(pageHandle, testInfo, `${label}-failed`).catch(() => undefined);
      throw error;
    }
  });
}

async function createWorkspaceFromMenu(pageHandle, testInfo) {
  await runHumanStep(pageHandle, testInfo, "create-workspace", async () => {
    const workspaceMenuButton = pageHandle.getByTitle("Workspace Menu");
    await expect(workspaceMenuButton).toBeVisible({ timeout: 30_000 });
    await workspaceMenuButton.click();
    await pageHandle.getByRole("button", { name: "New Workspace" }).click();
    await expect(pageHandle.getByText("No active workspace")).toHaveCount(0);
  });
}

function paneWidgetMenuButton(pageHandle, paneIndex = 0) {
  return pageHandle.getByRole("button", { name: "Pane Widget Menu" }).nth(paneIndex);
}

function paneActionsMenuButton(pageHandle, paneIndex = 0) {
  return pageHandle.getByRole("button", { name: "Pane Actions Menu" }).nth(paneIndex);
}

async function openPaneWidgetMenu(pageHandle, paneIndex = 0) {
  const button = paneWidgetMenuButton(pageHandle, paneIndex);
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click();
}

async function openPaneActionsMenu(pageHandle, paneIndex = 0) {
  const button = paneActionsMenuButton(pageHandle, paneIndex);
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click();
}

async function clickPaneWidgetMenuItem(pageHandle, paneIndex, itemName) {
  await openPaneWidgetMenu(pageHandle, paneIndex);
  await pageHandle.getByRole("button", { name: exactTextPattern(itemName) }).first().click();
}

async function clickPaneActionsMenuItem(pageHandle, paneIndex, itemName) {
  await openPaneActionsMenu(pageHandle, paneIndex);
  await pageHandle.getByRole("button", { name: exactTextPattern(itemName) }).first().click();
}

async function createTerminalWidgetInPane(pageHandle, testInfo, paneIndex = 0) {
  await runHumanStep(pageHandle, testInfo, `create-terminal-pane-${paneIndex + 1}`, async () => {
    await clickPaneWidgetMenuItem(pageHandle, paneIndex, "Terminal");
    await expect(pageHandle.getByRole("heading", { name: "Terminal Startup Scripts" })).toBeVisible();
    await pageHandle.getByRole("button", { name: "Create Without Scripts" }).click();
    const terminalStatusLine = pageHandle.getByText(/port \d+ · (starting|ready)/).first();
    await expect(terminalStatusLine).toBeVisible({ timeout: 30_000 });
  });
}

async function waitForVisibleWidgetRuntimeReady(pageHandle) {
  const runtimeStatus = pageHandle.locator("[data-testid='widget-runtime-status']:visible").first();
  await expect(runtimeStatus).toBeVisible({ timeout: 30_000 });
  await expect(runtimeStatus).toHaveText(/runtime ready/i, { timeout: 30_000 });
}

async function setupTwoPaneWorkspaceWithMarkdownTab(pageHandle, testInfo) {
  await createWorkspaceFromMenu(pageHandle, testInfo);

  await runHumanStep(pageHandle, testInfo, "split-pane-horizontal", async () => {
    await clickPaneActionsMenuItem(pageHandle, 0, "Split Horizontal");
    await expect(pageHandle.getByRole("button", { name: "Pane Widget Menu" })).toHaveCount(2);
  });

  await runHumanStep(pageHandle, testInfo, "create-markdown-tab", async () => {
    await clickPaneWidgetMenuItem(pageHandle, 0, "Note");
    await expect(pageHandle.getByRole("tab", { name: "Markdown" }).first()).toBeVisible();
  });

  const sourceTab = pageHandle
    .locator("div[draggable='true']")
    .filter({ has: pageHandle.getByRole("tab", { name: "Markdown" }).first() })
    .first();
  const targetPane = pageHandle.locator("main section").nth(1);

  await expect(sourceTab).toBeVisible();
  await expect(targetPane).toBeVisible();
  return {
    sourceTab,
    targetPane
  };
}

async function dragTabToZone(sourceTab, targetPane, zone) {
  const targetBox = await targetPane.boundingBox();
  if (!targetBox) {
    throw new Error("target pane bounding box not available");
  }
  const inset = 8;
  const targetPosition = {
    x:
      zone === "left"
        ? inset
        : zone === "right"
          ? Math.max(inset, targetBox.width - inset)
          : targetBox.width / 2,
    y:
      zone === "top"
        ? inset
        : zone === "bottom"
          ? Math.max(inset, targetBox.height - inset)
          : targetBox.height / 2
  };
  await sourceTab.dragTo(targetPane, { targetPosition });
}

async function getActiveWorkspaceName(pageHandle) {
  return await pageHandle.evaluate(async () => {
    const listed = await window.localtermApi.workspace.list();
    const defaultWorkspace = await window.localtermApi.workspace.getDefault();
    if (defaultWorkspace.workspace?.layout.name) {
      return defaultWorkspace.workspace.layout.name;
    }
    const firstOpen = listed.workspaces.find((workspace) => !workspace.isClosed);
    return firstOpen?.name ?? "";
  });
}

async function writeHumanSummary(testInfo) {
  if (!humanState) return;
  await fs.mkdir(humanReviewRoot, { recursive: true });

  const caseSlug = `${safeSlug(testInfo.title) || "case"}-${shortHash(testInfo.testId ?? testInfo.title)}`;
  const caseDir = path.join(humanReviewRoot, caseSlug);
  await fs.mkdir(caseDir, { recursive: true });

  const copiedSnapshots = [];
  for (const snapshot of humanState.snapshots) {
    const stepNo = String(snapshot.index).padStart(2, "0");
    const outputName = `${stepNo}.png`;
    const outputPath = path.join(caseDir, outputName);
    await fs.copyFile(snapshot.outputPath, outputPath);
    copiedSnapshots.push({
      label: snapshot.label,
      fileName: outputName
    });
  }

  const traceSrc = testInfo.outputPath("trace.zip");
  const traceDest = path.join(caseDir, "trace.zip");
  if (await fileExists(traceSrc)) {
    await fs.copyFile(traceSrc, traceDest);
  }

  const lines = [
    `# ${testInfo.title}`,
    "",
    `- status: ${testInfo.status}`,
    `- expected: ${testInfo.expectedStatus}`,
    `- trace: ${await fileExists(traceDest) ? "[trace.zip](./trace.zip)" : "not available"}`,
    "",
    "## Step Snapshots",
    ""
  ];

  if (copiedSnapshots.length === 0) {
    lines.push("- no snapshots captured");
  } else {
    for (let i = 0; i < copiedSnapshots.length; i++) {
      const item = copiedSnapshots[i];
      lines.push(`${i + 1}. ${item.label}`);
      lines.push(`![${item.label}](./${item.fileName})`);
      lines.push("");
    }
  }

  await fs.writeFile(path.join(caseDir, "README.md"), lines.join("\n"), "utf8");
  humanCaseRecords.push({
    title: testInfo.title,
    status: testInfo.status,
    caseSlug
  });
}

async function writeHumanIndex() {
  if (humanCaseRecords.length === 0) return;
  await fs.mkdir(humanReviewRoot, { recursive: true });
  const lines = [
    "# E2E Human Review",
    "",
    `Generated at: ${new Date().toISOString()}`,
    ""
  ];

  for (let i = 0; i < humanCaseRecords.length; i++) {
    const record = humanCaseRecords[i];
    lines.push(
      `${i + 1}. [${record.title} (${record.status})](./${record.caseSlug}/README.md)`
    );
  }

  lines.push("");
  await fs.writeFile(path.join(humanReviewRoot, "index.md"), lines.join("\n"), "utf8");
}

test.beforeEach(async ({}, testInfo) => {
  humanState = {
    stepIndex: 0,
    snapshots: []
  };

  tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-e2e-home-"));
  const tempUserDataDir = path.join(tempHomeDir, "user-data");
  await fs.mkdir(tempUserDataDir, { recursive: true });
  const electronEntry = path.resolve(process.cwd(), "tests/e2e/electron-entry.mjs");

  app = await electron.launch({
    executablePath: electronBinary,
    args: [electronEntry],
    env: {
      ...process.env,
      HOME: tempHomeDir,
      LOCALTERM_E2E_USER_DATA_DIR: tempUserDataDir,
      LOCALTERM_RENDERER_URL: rendererUrl
    }
  });

  await app.firstWindow();
  page = await waitForMainWindow(app);
  await page.waitForLoadState("domcontentloaded");

  await page.context().tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
    title: testInfo.title
  });

  await captureHumanSnapshot(page, testInfo, "app-ready");
});

test.afterEach(async ({}, testInfo) => {
  const tracePath = testInfo.outputPath("trace.zip");
  try {
    if (page && !page.isClosed()) {
      await page.context().tracing.stop({ path: tracePath });
      await testInfo.attach("trace", {
        path: tracePath,
        contentType: "application/zip"
      });
    }
  } catch {
    // ignore tracing stop errors on abrupt app shutdown
  }

  await writeHumanSummary(testInfo);

  await app?.close();
  if (tempHomeDir) {
    await fs.rm(tempHomeDir, { recursive: true, force: true });
  }
});

test.afterAll(async () => {
  await writeHumanIndex();
});

test("workspace + extension terminal widget end-to-end smoke", async ({}, testInfo) => {
  await createWorkspaceFromMenu(page, testInfo);
  await createTerminalWidgetInPane(page, testInfo, 0);
});

test("panel split + widget creation + pane close flow", async ({}, testInfo) => {
  await createWorkspaceFromMenu(page, testInfo);

  await runHumanStep(page, testInfo, "create-note-widget", async () => {
    await clickPaneWidgetMenuItem(page, 0, "Note");
    await expect(page.getByText(/widget builtin\.workspace:(note\.markdown|widget\.markdown)/)).toBeVisible();
  });

  await runHumanStep(page, testInfo, "split-horizontal", async () => {
    await clickPaneActionsMenuItem(page, 0, "Split Horizontal");
    await expect(page.getByRole("button", { name: "Pane Widget Menu" })).toHaveCount(2);
  });

  await runHumanStep(page, testInfo, "create-file-widget", async () => {
    await clickPaneWidgetMenuItem(page, 1, "File");
    await expect(page.getByText(/widget builtin\.workspace:file\.browser/).first()).toBeVisible();
  });

  await runHumanStep(page, testInfo, "close-second-pane", async () => {
    await clickPaneActionsMenuItem(page, 1, "Close Pane");
    await expect(page.getByRole("button", { name: "Pane Widget Menu" })).toHaveCount(1);
  });
});

test("builtin webview widgets load runtime and protocol urls", async ({}, testInfo) => {
  await createWorkspaceFromMenu(page, testInfo);

  await runHumanStep(page, testInfo, "open-note-widget-webview", async () => {
    await clickPaneWidgetMenuItem(page, 0, "Note");
    await expect(page.getByRole("tab", { name: "Markdown" }).first()).toBeVisible();
    await waitForVisibleWidgetRuntimeReady(page);
    const webviewSources = await page.locator("webview").evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("src"))
        .filter(Boolean)
    );
    expect(
      webviewSources.some((src) =>
        src.includes("localterm-extension://builtin.workspace/widgets/note.markdown/index.html")
      )
    ).toBeTruthy();
  });

  await runHumanStep(page, testInfo, "open-file-widget-webview", async () => {
    await clickPaneWidgetMenuItem(page, 0, "File");
    await expect(page.getByRole("tab", { name: "Files" }).first()).toBeVisible();
    await waitForVisibleWidgetRuntimeReady(page);
    const webviewSources = await page.locator("webview").evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("src"))
        .filter(Boolean)
    );
    expect(
      webviewSources.some((src) =>
        src.includes("localterm-extension://builtin.workspace/widgets/file.browser/index.html")
      )
    ).toBeTruthy();
  });
});

test("terminal startup scripts creation path works", async ({}, testInfo) => {
  await createWorkspaceFromMenu(page, testInfo);

  await runHumanStep(page, testInfo, "create-terminal-with-startup-script", async () => {
    await clickPaneWidgetMenuItem(page, 0, "Terminal");
    await expect(page.getByRole("heading", { name: "Terminal Startup Scripts" })).toBeVisible();
    await page.getByRole("button", { name: "+ Add Startup Script" }).click();
    await page.locator('input[type="number"]').first().fill("50");
    await page.getByPlaceholder("Command").first().fill("echo __E2E_STARTUP__");
    await page.getByRole("button", { name: "Create Terminal" }).click();

    await expect(page.getByRole("heading", { name: "Terminal Startup Scripts" })).toHaveCount(0);
    const terminalStatusLine = page.getByText(/port \d+ · (starting|ready)/).first();
    await expect(terminalStatusLine).toBeVisible({ timeout: 30_000 });
  });
});

test("workspace close to history then reopen from picker", async ({}, testInfo) => {
  await createWorkspaceFromMenu(page, testInfo);
  const activeWorkspaceName = await getActiveWorkspaceName(page);
  expect(activeWorkspaceName).toBeTruthy();

  await runHumanStep(page, testInfo, "close-workspace-to-history", async () => {
    const workspaceButton = page.getByTitle(exactTextPattern(activeWorkspaceName));
    await expect(workspaceButton).toBeVisible();
    await workspaceButton.click({ button: "right" });

    const workspaceContextMenu = page.locator("div.fixed.z-50").filter({
      has: page.getByRole("button", { name: "Rename" })
    }).first();
    await expect(workspaceContextMenu).toBeVisible();
    await workspaceContextMenu.getByRole("button", { name: /^Close$/ }).click();

    await expect(page.getByText("No active workspace")).toBeVisible();
  });

  await runHumanStep(page, testInfo, "reopen-workspace-from-picker", async () => {
    await page.getByTitle("Workspace Menu").click();
    await page.getByRole("button", { name: "Open Saved Workspace" }).click();
    await expect(page.getByRole("heading", { name: "Open Workspace" })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(escapeRegExp(activeWorkspaceName)) }).first().click();
    await expect(page.getByText("No active workspace")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pane Widget Menu" }).first()).toBeVisible();
  });
});

test("workspace save-as hot switch keeps local session alive", async ({}, testInfo) => {
  await createWorkspaceFromMenu(page, testInfo);
  await createTerminalWidgetInPane(page, testInfo, 0);
  const sourceWorkspaceName = await getActiveWorkspaceName(page);
  expect(sourceWorkspaceName).toBeTruthy();

  const baseSessionId = await page.evaluate(async () => {
    const listed = await window.localtermApi.session.listSessions();
    const ready = listed.sessions.find((session) => session.status === "ready");
    return ready?.sessionId ?? listed.sessions[0]?.sessionId ?? "";
  });
  expect(baseSessionId).toBeTruthy();

  await runHumanStep(page, testInfo, "save-as-new-workspace", async () => {
    await page.getByTitle("Settings").click();
    await page.getByRole("button", { name: "Save As" }).click();
    await expect(page.getByRole("heading", { name: "Save Workspace As" })).toBeVisible();
    await page.getByPlaceholder("Workspace name").fill("E2E Saved Workspace");
    await page.getByRole("button", { name: "Save As New" }).click();
    await expect(page.getByTitle("E2E Saved Workspace")).toBeVisible();
  });

  await runHumanStep(page, testInfo, "switch-back-and-assert-session-alive", async () => {
    await page.getByTitle(exactTextPattern(sourceWorkspaceName)).click();
    const sessionStillExists = await page.evaluate(async (sessionId) => {
      const listed = await window.localtermApi.session.listSessions();
      return listed.sessions.some((session) => session.sessionId === sessionId);
    }, baseSessionId);
    expect(sessionStillExists).toBeTruthy();
  });
});

test("tab drag-drop center moves tab without creating extra split", async ({}, testInfo) => {
  const { sourceTab, targetPane } = await setupTwoPaneWorkspaceWithMarkdownTab(page, testInfo);
  await runHumanStep(page, testInfo, "drag-tab-center", async () => {
    await dragTabToZone(sourceTab, targetPane, "center");
    await expect(page.getByRole("button", { name: "Pane Widget Menu" })).toHaveCount(2);
    await expect(page.getByRole("tab", { name: "Markdown" }).first()).toBeVisible();
  });
});

for (const zone of ["left", "right", "top", "bottom"]) {
  test(`tab drag-drop ${zone} creates a new split`, async ({}, testInfo) => {
    const { sourceTab, targetPane } = await setupTwoPaneWorkspaceWithMarkdownTab(page, testInfo);
    await runHumanStep(page, testInfo, `drag-tab-${zone}`, async () => {
      await dragTabToZone(sourceTab, targetPane, zone);
      await expect(page.getByRole("button", { name: "Pane Widget Menu" })).toHaveCount(3);
      await expect(page.getByRole("tab", { name: "Markdown" }).first()).toBeVisible();
    });
  });
}
