/**
 * Reserved for port allocation and collision-safe retries.
 */
import net from "node:net";
import { DEFAULTS } from "@localterm/shared";

export class PortAllocator {
  async allocate(host = DEFAULTS.workerHost): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once("error", reject);
      server.listen(0, host, () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Failed to allocate port"));
          return;
        }
        const { port } = address;
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(port);
        });
      });
    });
  }
}
