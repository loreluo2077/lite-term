# Extension Terminal React Widget

React + Tailwind + xterm.js webview widget for `terminal.local`.

Features:

- Full ANSI terminal rendering (xterm.js)
- Auto fit + resize sync (`widgetApi.terminal.resize`)
- Selection copy button
- Context menu: Paste / Clear

## Build

```bash
pnpm --filter @localterm/widget-terminal-react build
```

Output path:

- `extensions/builtin.workspace/widgets/terminal.local/index.html`
- `extensions/builtin.workspace/widgets/terminal.local/assets/*`
