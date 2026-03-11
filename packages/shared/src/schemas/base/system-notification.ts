import { z } from "zod";

export const systemNotifyRequestSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  silent: z.boolean().optional()
});

export type SystemNotifyRequest = z.infer<typeof systemNotifyRequestSchema>;
