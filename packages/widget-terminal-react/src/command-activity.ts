export type TerminalCommandRunState = "idle" | "pending" | "running" | "completed";

export type CommandInputUpdate = {
  nextBuffer: string;
  submittedCommands: string[];
  shouldResetCompleted: boolean;
  interrupted: boolean;
};

function trimCommandText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

export function normalizeCommandText(value: string) {
  return trimCommandText(value);
}

function isPrintableInput(char: string) {
  return char >= " " && char !== "\u007f";
}

export function consumeTerminalInput(buffer: string, data: string, currentState: TerminalCommandRunState): CommandInputUpdate {
  let nextBuffer = buffer;
  const submittedCommands: string[] = [];
  let shouldResetCompleted = false;
  let interrupted = false;

  for (const char of data) {
    if (char === "\r" || char === "\n") {
      const command = trimCommandText(nextBuffer);
      if (command.length > 0) {
        submittedCommands.push(command);
      }
      nextBuffer = "";
      continue;
    }

    if (char === "\u0003") {
      interrupted = true;
      nextBuffer = "";
      continue;
    }

    if (char === "\u007f") {
      nextBuffer = nextBuffer.slice(0, -1);
      if (currentState === "completed") {
        shouldResetCompleted = true;
      }
      continue;
    }

    if (char === "\u0015") {
      nextBuffer = "";
      if (currentState === "completed") {
        shouldResetCompleted = true;
      }
      continue;
    }

    if (char === "\u001b") {
      continue;
    }

    if (isPrintableInput(char)) {
      nextBuffer += char;
      if (currentState === "completed") {
        shouldResetCompleted = true;
      }
    }
  }

  return {
    nextBuffer,
    submittedCommands,
    shouldResetCompleted,
    interrupted
  };
}
