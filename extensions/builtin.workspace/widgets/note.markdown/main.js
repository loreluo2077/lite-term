const editor = document.getElementById("editor");
const viewer = document.getElementById("viewer");
const btnInline = document.getElementById("btn-inline");
const btnOpenFile = document.getElementById("btn-open-file");
const btnToggleMode = document.getElementById("btn-toggle-mode");
const statusText = document.getElementById("status");

function basename(filePath) {
  if (!filePath) return "Markdown";
  const parts = String(filePath).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || "Markdown";
}

function normalizeState(raw) {
  const source = raw?.source === "file" ? "file" : "inline";
  const mode = raw?.mode === "read" ? "read" : "edit";
  const content = typeof raw?.content === "string" ? raw.content : "# Notes\n\n";
  const filePath = typeof raw?.filePath === "string" ? raw.filePath : null;
  return { source, mode, content, filePath };
}

let context = null;
let state = normalizeState({});

function render() {
  const editing = state.source === "inline" && state.mode === "edit";
  editor.style.display = editing ? "block" : "none";
  viewer.style.display = editing ? "none" : "block";
  editor.value = state.content;
  viewer.textContent = state.content;
  btnToggleMode.textContent = editing ? "Read Mode" : "Edit Mode";
  statusText.textContent = state.source === "file" ? state.filePath || "(missing file)" : "inline";
}

async function persist(nextState) {
  state = normalizeState(nextState);
  await window.widgetApi.state.set(state);
  render();
}

async function loadFile(filePath) {
  const response = await window.widgetApi.fs.readFile({
    filePath,
    maxBytes: 1024 * 1024
  });
  const suffix = response.truncated ? "\n\n[truncated]" : "";
  await persist({
    ...state,
    source: "file",
    filePath,
    mode: "read",
    content: `${response.content}${suffix}`
  });
  await window.widgetApi.widget.setTitle(basename(filePath));
}

editor.addEventListener("input", async (event) => {
  const content = event.target.value;
  state = {
    ...state,
    content,
    source: "inline",
    mode: "edit"
  };
  await window.widgetApi.state.patch({
    content,
    source: "inline",
    mode: "edit"
  });
});

btnInline.addEventListener("click", async () => {
  await persist({
    ...state,
    source: "inline",
    mode: "edit"
  });
});

btnOpenFile.addEventListener("click", async () => {
  const selected = await window.widgetApi.fs.pickFile({
    filters: [{ name: "Markdown", extensions: ["md", "mdx", "txt"] }]
  });
  if (!selected.path) return;
  await loadFile(selected.path);
});

btnToggleMode.addEventListener("click", async () => {
  if (state.source !== "inline") return;
  await persist({
    ...state,
    mode: state.mode === "edit" ? "read" : "edit"
  });
});

window.widgetApi.state.onDidChange((nextState) => {
  state = normalizeState(nextState);
  render();
});

async function bootstrap() {
  context = await window.widgetApi.widget.getContext();
  const storedState = await window.widgetApi.state.get();
  state = normalizeState(storedState);
  render();

  if (state.source === "file" && state.filePath) {
    try {
      await loadFile(state.filePath);
    } catch (error) {
      statusText.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  if (context?.tabTitle) {
    document.title = context.tabTitle;
  }
}

void bootstrap().catch((error) => {
  statusText.textContent = error instanceof Error ? error.message : String(error);
});
