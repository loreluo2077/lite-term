/**
 * Reserved for port allocation and collision-safe retries.
 *
 * Tracks pending ports to prevent race conditions when multiple sessions
 * are created concurrently. This matches electerm's port allocation strategy.
 *
 * Key difference from initial implementation: We now use a sequential port counter
 * (like electerm) and mark ports as pending BEFORE checking availability, eliminating
 * the race condition where multiple concurrent allocate() calls could get the same
 * port from listen(0).
 */
import net from "node:net";
import { DEFAULTS } from "@localterm/shared";

const MIN_PORT = 39000;
const MAX_PORT = 49999;

export class PortAllocator {
  private readonly pendingPorts = new Set<number>();
  private lastPort = MIN_PORT;

  async allocate(host = DEFAULTS.workerHost): Promise<number> {
    const maxAttempts = MAX_PORT - MIN_PORT + 1;
    let attempts = 0;

    while (attempts < maxAttempts) {
      // Get next sequential port (synchronized, avoids race condition)
      let candidatePort = this.lastPort >= MAX_PORT ? MIN_PORT : this.lastPort + 1;

      // Skip ports that are currently being assigned (synchronized check)
      while (this.pendingPorts.has(candidatePort)) {
        candidatePort = candidatePort >= MAX_PORT ? MIN_PORT : candidatePort + 1;
      }

      // Mark as pending BEFORE async check (critical for preventing race conditions)
      // This is the key fix: electerm does pendingPorts.add() before find-free-port
      this.pendingPorts.add(candidatePort);
      this.lastPort = candidatePort;

      try {
        // Verify the port is actually available
        const isAvailable = await this.checkPortAvailable(candidatePort, host);

        if (isAvailable) {
          console.log(`[port-allocator] Allocated port ${candidatePort} (pending: ${Array.from(this.pendingPorts).join(', ')})`);
          return candidatePort;
        } else {
          // Port not available, remove from pending and try next
          this.pendingPorts.delete(candidatePort);
          console.warn(`[port-allocator] Port ${candidatePort} not available, trying next (attempt ${attempts + 1})`);
        }
      } catch (error) {
        // Error checking port, remove from pending and try next
        this.pendingPorts.delete(candidatePort);
        console.error(`[port-allocator] Error checking port ${candidatePort}:`, error);
      }

      attempts++;
    }

    throw new Error("Failed to allocate unique port after max retries");
  }

  release(port: number): void {
    console.log(`[port-allocator] Released port ${port} (remaining: ${Array.from(this.pendingPorts).filter(p => p !== port).join(', ') || 'none'})`);
    this.pendingPorts.delete(port);
  }

  private async checkPortAvailable(port: number, host: string): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.unref();

      server.once("error", (err: NodeJS.ErrnoException) => {
        // Port is in use
        if (err.code === "EADDRINUSE") {
          resolve(false);
        } else {
          // Other errors also mean port is not available
          resolve(false);
        }
      });

      server.listen(port, host, () => {
        // Port is available, close and return true
        server.close(() => {
          resolve(true);
        });
      });
    });
  }
}
