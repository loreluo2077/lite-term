# Command Snippets Widget

Lightweight widget for storing, searching, copying, and reusing command/prompt snippets in workspace.

## Development

```bash
pnpm --filter @localterm/widget-command-snippets-react dev
```

## Build to extension assets

```bash
pnpm build:widget:command-snippets
```

After build, assets are generated under:

- `extensions/builtin.workspace/widgets/command-snippets/index.html`
- `extensions/builtin.workspace/widgets/command-snippets/assets/*`
