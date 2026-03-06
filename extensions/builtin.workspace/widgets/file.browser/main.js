const pathText = document.getElementById("current-path");
const listEl = document.getElementById("list");
const selectedText = document.getElementById("selected");
const btnChoose = document.getElementById("btn-choose");
const btnUp = document.getElementById("btn-up");
const btnHidden = document.getElementById("btn-hidden");
const btnOpen = document.getElementById("btn-open");

function normalizeState(raw) {
  const rootPath = typeof raw?.rootPath === "string" ? raw.rootPath : "";
  const currentPath = typeof raw?.currentPath === "string" ? raw.currentPath : rootPath;
  const selectedPath = typeof raw?.selectedPath === "string" ? raw.selectedPath : null;
  const showHidden = raw?.showHidden === true;
  return { rootPath, currentPath, selectedPath, showHidden };
}

function parentDir(dirPath, rootPath) {
  if (!dirPath) return rootPath;
  if (dirPath === rootPath) return rootPath;
  const normalized = dirPath.replace(/[\\/]+$/, "");
  const splitAt = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (splitAt <= 0) return rootPath;
  return normalized.slice(0, splitAt);
}

function basename(filePath) {
  const parts = String(filePath).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || filePath;
}

let state = normalizeState({});
let entries = [];

function renderList() {
  listEl.innerHTML = "";
  if (!state.currentPath) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "Choose a folder to browse files.";
    listEl.appendChild(placeholder);
    return;
  }

  if (entries.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "No entries";
    listEl.appendChild(placeholder);
    return;
  }

  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `entry${entry.path === state.selectedPath ? " selected" : ""}`;

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = `${entry.kind === "directory" ? "[DIR]" : "[FILE]"} ${entry.name}`;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = entry.kind === "file" && entry.size != null ? `${entry.size}B` : "";

    button.appendChild(label);
    button.appendChild(meta);
    button.addEventListener("click", async () => {
      if (entry.kind === "directory") {
        await updateState({
          ...state,
          currentPath: entry.path,
          selectedPath: null
        });
        await refreshEntries();
        return;
      }

      await updateState({
        ...state,
        selectedPath: entry.path
      });
    });

    listEl.appendChild(button);
  }
}

function render() {
  btnHidden.textContent = state.showHidden ? "Hide Dotfiles" : "Show Dotfiles";
  btnUp.disabled = !state.currentPath || state.currentPath === state.rootPath;
  btnOpen.disabled = !state.selectedPath;
  pathText.textContent = state.currentPath || "(no folder selected)";
  selectedText.textContent = state.selectedPath || "Select a file to open in markdown widget";
  renderList();
}

async function updateState(nextState) {
  state = normalizeState(nextState);
  await window.widgetApi.state.set(state);
  render();
}

async function refreshEntries() {
  if (!state.currentPath) {
    entries = [];
    render();
    return;
  }

  try {
    const response = await window.widgetApi.fs.readDir({
      dirPath: state.currentPath,
      includeHidden: state.showHidden
    });
    entries = response.entries || [];
  } catch (error) {
    entries = [];
    selectedText.textContent = error instanceof Error ? error.message : String(error);
  }
  render();
}

btnChoose.addEventListener("click", async () => {
  const selected = await window.widgetApi.fs.pickDirectory();
  if (!selected.path) return;
  await updateState({
    rootPath: selected.path,
    currentPath: selected.path,
    selectedPath: null,
    showHidden: state.showHidden
  });
  await refreshEntries();
});

btnUp.addEventListener("click", async () => {
  const nextPath = parentDir(state.currentPath, state.rootPath);
  await updateState({
    ...state,
    currentPath: nextPath,
    selectedPath: null
  });
  await refreshEntries();
});

btnHidden.addEventListener("click", async () => {
  await updateState({
    ...state,
    showHidden: !state.showHidden
  });
  await refreshEntries();
});

btnOpen.addEventListener("click", async () => {
  if (!state.selectedPath) return;
  await window.widgetApi.widget.openWidget({
    widgetId: "note.markdown",
    title: basename(state.selectedPath),
    state: {
      source: "file",
      filePath: state.selectedPath,
      mode: "read"
    }
  });
});

window.widgetApi.state.onDidChange((nextState) => {
  state = normalizeState(nextState);
  render();
});

async function bootstrap() {
  await window.widgetApi.widget.getContext();
  const storedState = await window.widgetApi.state.get();
  state = normalizeState(storedState);
  render();
  await refreshEntries();
}

void bootstrap().catch((error) => {
  selectedText.textContent = error instanceof Error ? error.message : String(error);
});
