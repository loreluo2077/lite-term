import { Button } from "@/components/ui/button";
import type { WidgetTabRecord } from "../../lib/widgets/state";
import {
  getWidgetContribution,
  parseWidgetInput
} from "../../lib/plugins";
import type { OpenWidgetRequest } from "../../lib/plugins";

type Props = {
  tab: WidgetTabRecord;
  isActive: boolean;
  onUpdateInput: (tabId: string, input: Record<string, unknown>) => void;
  onUpdateTitle: (tabId: string, title: string) => void;
  onOpenWidget: (request: OpenWidgetRequest) => void;
};

export function PluginWidgetPane({
  tab,
  isActive,
  onUpdateInput,
  onUpdateTitle,
  onOpenWidget
}: Props) {
  const widgetInput = parseWidgetInput(tab.widget.input);
  if (!widgetInput) {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-red-900/50 bg-zinc-950 p-4 text-sm text-red-200">
        Invalid widget input payload.
      </div>
    );
  }

  const widget = getWidgetContribution(widgetInput.extensionId, widgetInput.widgetId);
  if (!widget) {
    return (
      <div className="grid h-full grid-rows-[auto_1fr] gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-400">
          Missing widget contribution: {widgetInput.extensionId}:{widgetInput.widgetId}
        </div>
        <div className="grid place-items-center text-xs text-zinc-500">
          Install or re-enable the extension to restore this tab.
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2">
      <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-400">
        <span className="truncate">
          {tab.title} · widget {widgetInput.extensionId}:{widgetInput.widgetId}
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
          input: widgetInput,
          state: widgetInput.state,
          setState: (nextState) => {
            const finalState =
              typeof nextState === "function"
                ? nextState(widgetInput.state)
                : nextState;
            onUpdateInput(tab.id, {
              ...widgetInput,
              state: finalState
            });
          },
          setTitle: (nextTitle) => onUpdateTitle(tab.id, nextTitle),
          openWidget: onOpenWidget
        })}
      </div>
    </div>
  );
}
