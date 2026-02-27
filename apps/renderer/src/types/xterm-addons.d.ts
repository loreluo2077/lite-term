declare module "@xterm/addon-attach" {
  export class AttachAddon {
    constructor(socket: WebSocket, options?: { bidirectional?: boolean });
    activate(terminal: unknown): void;
    dispose(): void;
  }
}

declare module "@xterm/addon-canvas" {
  export class CanvasAddon {
    activate(terminal: unknown): void;
    dispose(): void;
  }
}

declare module "@xterm/addon-fit" {
  export class FitAddon {
    activate(terminal: unknown): void;
    fit(): void;
    dispose(): void;
  }
}

declare module "@xterm/addon-ligatures" {
  export class LigaturesAddon {
    activate(terminal: unknown): void;
    dispose(): void;
  }
}

declare module "@xterm/addon-search" {
  export class SearchAddon {
    activate(terminal: unknown): void;
    dispose(): void;
    findNext(term: string, options?: Record<string, unknown>): boolean;
    findPrevious(term: string, options?: Record<string, unknown>): boolean;
  }
}

declare module "@xterm/addon-unicode11" {
  export class Unicode11Addon {
    activate(terminal: unknown): void;
    dispose(): void;
  }
}

declare module "@xterm/addon-web-links" {
  export class WebLinksAddon {
    constructor(handler?: (event: MouseEvent, uri: string) => void);
    activate(terminal: unknown): void;
    dispose(): void;
  }
}

declare module "@xterm/addon-webgl" {
  export class WebglAddon {
    activate(terminal: unknown): void;
    dispose(): void;
  }
}
