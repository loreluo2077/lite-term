import { Button } from "@/components/ui/button";
import type { WidgetTabRecord } from "../../lib/widgets/state";
import {
  getPluginWidgetContribution,
  parsePluginWidgetInput
} from "../../lib/plugins";
import type { OpenPluginWidgetRequest } from "../../lib/plugins";

type Props = {
  tab: WidgetTabRecord;
  isActive: boolean;
  onUpdateInput: (tabId: string, input: Record<string, unknown>) => void;
  onUpdateTitle: (tabId: string, title: string) => void;
  onOpenPluginWidget: (request: OpenPluginWidgetRequest) => void;
};

export function PluginWidgetPane({
  tab,
  isActive,
  onUpdateInput,
  onUpdateTitle,
  onOpenPluginWidget
}: Props) {
  const pluginInput = parsePluginWidgetInput(tab.widget.input);
  if (!pluginInput) {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-red-900/50 bg-zinc-950 p-4 text-sm text-red-200">
        Invalid plugin tab input payload.
      </div>
    );
  }

  const widget = getPluginWidgetContribution(pluginInput.pluginId, pluginInput.widgetId);
  if (!widget) {
    return (
      <div className="grid h-full grid-rows-[auto_1fr] gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-400">
          Missing plugin widget: {pluginInput.pluginId}:{pluginInput.widgetId}
        </div>
        <div className="grid place-items-center text-xs text-zinc-500">
          Install or re-enable the plugin to restore this tab.
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2">
      <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-400">
        <span className="truncate">
          {tab.title} · plugin {pluginInput.pluginId}:{pluginInput.widgetId}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={() => {
            const nextTitle = window.prompt("Tab title", tab.title)?.trim();
            if (!nextTitle) return;
            onUpdateTitle(tab.id, nextTitle);
          }}
        >
          Rename
        </Button>
      </div>
      <div className="min-h-0">
        {widget.render({
          tabId: tab.id,
          tabTitle: tab.title,
          isActive,
          input: pluginInput,
          state: pluginInput.state,
          setState: (nextState) => {
            const finalState =
              typeof nextState === "function"
                ? nextState(pluginInput.state)
                : nextState;
            onUpdateInput(tab.id, {
              ...pluginInput,
              state: finalState
            });
          },
          setTitle: (nextTitle) => onUpdateTitle(tab.id, nextTitle),
          openPluginWidget: onOpenPluginWidget,
          openPluginView: onOpenPluginWidget
        })}
      </div>
    </div>
  );
}
