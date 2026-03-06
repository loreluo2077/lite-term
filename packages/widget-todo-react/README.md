# React Webview Widget Template (Todo)

This package is a template for building a React widget that runs inside the webview runtime.

## Structure

- `src/widget-api.ts`: widgetApi hooks (`useWidgetContext`, `useWidgetState`)
- `src/App.tsx`: Todo example with state sync
- `vite.config.ts`: build output to `extensions/builtin.workspace/widgets/todo.react`

## Development

```bash
pnpm --filter @localterm/widget-todo-react dev
```

## Build to extension assets

```bash
pnpm build:widget:todo
```

After build, assets are generated under:

- `extensions/builtin.workspace/widgets/todo.react/index.html`
- `extensions/builtin.workspace/widgets/todo.react/assets/*`

## Runtime integration

- Registered in builtin manifest and renderer template registry as `todo.react`.
- In app UI, open it via pane header button: `+Todo`.
