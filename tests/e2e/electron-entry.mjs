import { app } from "electron";
import { register } from "tsx/esm/api";

const userDataDir = process.env.LOCALTERM_E2E_USER_DATA_DIR;
if (userDataDir) {
  app.setPath("userData", userDataDir);
}

register();
await import("../../apps/desktop/src/main/index.ts");
