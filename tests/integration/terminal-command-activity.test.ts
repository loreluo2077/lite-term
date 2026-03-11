import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeTerminalInput,
  normalizeCommandText
} from "../../packages/widget-terminal-react/src/command-activity";

test("consumeTerminalInput tracks command submission and edits", () => {
  let buffer = "";
  let result = consumeTerminalInput(buffer, "git status", "idle");
  buffer = result.nextBuffer;
  assert.equal(buffer, "git status");
  assert.deepEqual(result.submittedCommands, []);

  result = consumeTerminalInput(buffer, "\u007f", "idle");
  buffer = result.nextBuffer;
  assert.equal(buffer, "git statu");

  result = consumeTerminalInput(buffer, "s\r", "idle");
  assert.equal(result.nextBuffer, "");
  assert.deepEqual(result.submittedCommands, ["git status"]);
});

test("consumeTerminalInput resets completed state when user starts typing again", () => {
  const result = consumeTerminalInput("", "n", "completed");
  assert.equal(result.nextBuffer, "n");
  assert.equal(result.shouldResetCompleted, true);
});

test("normalizeCommandText compacts whitespace and truncates long content", () => {
  const normalized = normalizeCommandText("  pnpm    test   --filter  app  ");
  assert.equal(normalized, "pnpm test --filter app");
  assert.equal(normalizeCommandText("x".repeat(300)).length, 160);
});
