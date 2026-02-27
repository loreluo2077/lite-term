# Xterm Parity (electerm -> localterm)

This document tracks xterm/xterm-addon feature parity against `electerm`, focusing on what is actually used in code (not just what exists in `package.json`).

## Scope

- Reference project: `electerm`
- Primary reference files:
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/xterm-loader.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/terminal.jsx`
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/attach-addon-custom.js`
- Target project: `localterm` phase 1 (local terminal only)

## Addon Mapping

| electerm addon | electerm usage | localterm strategy | Phase 1 status |
|---|---|---|---|
| `@xterm/addon-fit` | terminal resize fitting | Same addon | Implemented |
| `@xterm/addon-attach` | Wrapped by custom `attach-addon-custom.js` for WS attach + output filtering | Replaced with local custom WS connector (`connect-session-ws.ts`) and explicit `term.onData/onBinary` wiring | Implemented (equivalent, not same addon) |
| `@xterm/addon-web-links` | URL detection + click handling | Same addon | Implemented |
| `@xterm/addon-search` | Search UI + result tracking | Addon initialized; UI/shortcut panel deferred | Partially implemented |
| `@xterm/addon-unicode11` | Better Unicode width handling | Same addon + `term.unicode.activeVersion = "11"` | Implemented |
| `@xterm/addon-ligatures` | Visual enhancement for ligatures | Same addon; best-effort load | Implemented (best-effort) |
| `@xterm/addon-webgl` | Preferred renderer for performance | Try WebGL first, fallback on failure | Implemented |
| `@xterm/addon-canvas` | Fallback renderer | Fallback when WebGL unavailable | Implemented |

## electerm Custom Terminal Features (Non-Addon)

These are important because they are part of electerm's xterm experience, but are not simply xterm addons:

| electerm feature | Reference | localterm phase 1 status | Notes |
|---|---|---|---|
| `attach-addon-custom` (WS attach wrapper, protocol filtering, suppression hooks) | `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/attach-addon-custom.js` | Partial equivalent | We use `connect-session-ws.ts` + explicit xterm data wiring. No shell-integration suppression or zmodem/trzsz filtering yet. |
| `CommandTrackerAddon` (OSC 633 command/cwd tracking) | `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/command-tracker-addon.js` | Not implemented | Deferred until SSH + shell integration phase. |
| Shell integration injection (`shell.js`) | `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/shell.js` | Not implemented | Out of phase 1 scope. |
| Keyword highlighting addon | `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/highlight-addon.js` | Not implemented | UX enhancement, defer. |
| Search result bar UI | `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/terminal-search-bar*` | Not implemented | `addon-search` is loaded first so UI can be added later without rewiring terminal core. |

## Why localterm does not use `@xterm/addon-attach` directly (yet)

`electerm` does not use the stock attach addon directly either. It wraps it with custom behavior (`attach-addon-custom.js`) to support:

- output suppression during shell integration injection
- custom decode behavior
- protocol filtering (e.g. zmodem/trzsz events)
- initial-data hooks

For `localterm` phase 1 (local PTY only), the simpler and clearer approach is:

- `connect-session-ws.ts` handles WS framing and control-event parsing
- `TerminalPane.tsx` handles xterm input/output attachment explicitly

This preserves the same control/data plane split while keeping phase 1 simpler.

## Current Gaps To Close (Before SSH Phase)

1. Search UI (toolbar / dialog + next/prev) on top of `@xterm/addon-search`
2. Optional renderer preference (DOM / Canvas / WebGL) in settings
3. Terminal feature flags/config persistence (ligatures, links, renderer)
4. If future protocols share the same WS, add an attach wrapper like electerm's custom attach layer
