import { z } from "zod";
import { tabDescriptorSchema } from "./tab-descriptor";

export const paneDirectionSchema = z.enum(["horizontal", "vertical"]);

export type LeafPaneNode = {
  id: string;
  type: "leaf";
  tabIds: string[];
  activeTabId?: string | undefined;
};

export type SplitPaneNode = {
  id: string;
  type: "split";
  direction: z.infer<typeof paneDirectionSchema>;
  children: [PaneNode, PaneNode];
  sizes: [number, number];
};

export type PaneNode = LeafPaneNode | SplitPaneNode;

export const paneNodeSchema: z.ZodType<PaneNode> = z.lazy(() =>
  z.union([
    z.object({
      id: z.string().min(1),
      type: z.literal("leaf"),
      tabIds: z.array(z.string().min(1)),
      activeTabId: z.string().min(1).optional()
    }),
    z.object({
      id: z.string().min(1),
      type: z.literal("split"),
      direction: paneDirectionSchema,
      children: z.tuple([paneNodeSchema, paneNodeSchema]),
      sizes: z
        .tuple([
          z.number().positive().max(1),
          z.number().positive().max(1)
        ])
        .refine(([left, right]) => Math.abs(left + right - 1) < 0.001, {
          message: "sizes must sum to 1"
        })
    })
  ])
);

export const floatingPanelDescriptorSchema = z.object({
  id: z.string().min(1),
  panelKind: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  pinned: z.boolean().optional(),
  payload: z.record(z.string(), z.unknown()).optional()
});

export const overlayLayoutSchema = z.object({
  floatingPanels: z.array(floatingPanelDescriptorSchema),
  commandRadial: z
    .object({
      enabled: z.boolean(),
      hotkey: z.string().min(1)
    })
    .optional()
});

export const workspaceLayoutSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  name: z.string().min(1),
  root: paneNodeSchema,
  activePaneId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  overlays: overlayLayoutSchema.optional()
});

export const workspaceSnapshotSchema = z.object({
  layout: workspaceLayoutSchema,
  tabs: z.array(tabDescriptorSchema)
});

export const workspaceMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lastAccessed: z.number().int().nonnegative()
});

export const workspaceIndexSchema = z.object({
  workspaces: z.array(workspaceMetaSchema)
});

export const workspaceIdRequestSchema = z.object({
  id: z.string().min(1)
});

export const workspaceListResponseSchema = z.object({
  workspaces: z.array(workspaceMetaSchema)
});

export const workspaceGetDefaultResponseSchema = z.object({
  workspace: workspaceSnapshotSchema.nullable()
});

export type PaneDirection = z.infer<typeof paneDirectionSchema>;
export type FloatingPanelDescriptor = z.infer<typeof floatingPanelDescriptorSchema>;
export type OverlayLayout = z.infer<typeof overlayLayoutSchema>;
export type WorkspaceLayout = z.infer<typeof workspaceLayoutSchema>;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
export type WorkspaceMeta = z.infer<typeof workspaceMetaSchema>;
export type WorkspaceIndex = z.infer<typeof workspaceIndexSchema>;
export type WorkspaceIdRequest = z.infer<typeof workspaceIdRequestSchema>;
export type WorkspaceListResponse = z.infer<typeof workspaceListResponseSchema>;
export type WorkspaceGetDefaultResponse = z.infer<typeof workspaceGetDefaultResponseSchema>;
