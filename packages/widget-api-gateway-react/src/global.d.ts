import type {
  ApiGatewayCheckProviderHealthRequest,
  ApiGatewayCheckProviderHealthResponse,
  ApiGatewayConfig,
  ApiGatewaySaveConfigRequest,
  ApiGatewayStatus,
  ExtensionWidgetInput
} from "@localterm/shared";

type WidgetApiContext = {
  tabId: string;
  tabTitle: string;
  isActive: boolean;
  input: ExtensionWidgetInput;
  workspaceId: string;
  workspaceName: string;
  workspaceRootPath: string;
};

declare global {
  interface Window {
    widgetApi: {
      widget: {
        getContext(): Promise<WidgetApiContext>;
        setTitle(title: string): Promise<{ ok: true }>;
      };
      gateway: {
        getConfig(): Promise<ApiGatewayConfig>;
        saveConfig(payload: ApiGatewaySaveConfigRequest): Promise<ApiGatewayConfig>;
        getStatus(): Promise<ApiGatewayStatus>;
        start(): Promise<ApiGatewayStatus>;
        stop(): Promise<ApiGatewayStatus>;
        checkProviderHealth(
          payload: ApiGatewayCheckProviderHealthRequest
        ): Promise<ApiGatewayCheckProviderHealthResponse>;
      };
    };
  }
}

export {};
