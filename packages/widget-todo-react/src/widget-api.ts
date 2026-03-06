import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type WidgetContext = {
  tabId: string;
  tabTitle: string;
  isActive: boolean;
  workspaceId: string;
  workspaceName: string;
};

function ensureWidgetApi() {
  if (typeof window === "undefined" || !window.widgetApi) {
    throw new Error("widgetApi is unavailable");
  }
  return window.widgetApi;
}

function mergeState<T extends Record<string, unknown>>(defaults: T, state: Record<string, unknown>): T {
  return {
    ...defaults,
    ...state
  } as T;
}

export function useWidgetContext() {
  const [context, setContext] = useState<WidgetContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void ensureWidgetApi()
      .widget
      .getContext()
      .then((ctx) => {
        if (cancelled) return;
        setContext({
          tabId: ctx.tabId,
          tabTitle: ctx.tabTitle,
          isActive: ctx.isActive,
          workspaceId: ctx.workspaceId,
          workspaceName: ctx.workspaceName
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("load widget context failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return context;
}

export function useWidgetState<T extends Record<string, unknown>>(defaults: T) {
  const [state, setState] = useState<T>(defaults);
  const stateRef = useRef<T>(defaults);

  useEffect(() => {
    let cancelled = false;
    const api = ensureWidgetApi();

    void api.state
      .get()
      .then((raw) => {
        if (cancelled) return;
        const merged = mergeState(defaults, raw ?? {});
        stateRef.current = merged;
        setState(merged);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("load widget state failed", error);
      });

    const dispose = api.state.onDidChange((next) => {
      if (cancelled) return;
      const merged = mergeState(defaults, next ?? {});
      stateRef.current = merged;
      setState(merged);
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, [defaults]);

  const patchState = useCallback(async (patch: Partial<T>) => {
    const api = ensureWidgetApi();
    const nextState = {
      ...stateRef.current,
      ...patch
    } as T;
    stateRef.current = nextState;
    setState(nextState);
    await api.state.patch(patch as Record<string, unknown>);
  }, []);

  return useMemo(
    () => ({
      state,
      patchState
    }),
    [patchState, state]
  );
}

export async function setWidgetTitle(title: string) {
  await ensureWidgetApi().widget.setTitle(title);
}
