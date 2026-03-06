import { z } from "zod";

export const extensionHostConfigSchema = z.object({
  widgetWebviewPreloadUrl: z.string().min(1)
});

export type ExtensionHostConfig = z.infer<typeof extensionHostConfigSchema>;
