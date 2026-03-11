export function getWidgetApi() {
  if (typeof window === "undefined" || !window.widgetApi) {
    throw new Error("widgetApi is unavailable");
  }
  return window.widgetApi;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
