import { create } from "zustand";
import { env } from "../config/env";
import { debugRemoteUi } from "../lib/figma-bridge";
import { client } from "./generated/client.gen";

/** 플러그인 계정 토큰. iframe은 쿠키를 쓸 수 없어 Bearer로 보낸다. */
export const useAuthToken = create<{ token: string | null }>(() => ({
  token: null,
}));

/** 앱 시작 때 한 번 부른다 */
export function configureApiClient() {
  client.setConfig({ baseUrl: env.apiBaseUrl });
  client.interceptors.request.use((request) => {
    const { token } = useAuthToken.getState();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  });
  if (env.pluginUiDebug) {
    client.interceptors.response.use((response, request) => {
      debugRemoteUi("api", {
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
      });
      return response;
    });
    client.interceptors.error.use((error, response, request) => {
      if (!response)
        debugRemoteUi("api network error", {
          method: request?.method,
          path: request ? new URL(request.url).pathname : undefined,
          error: String(error),
        });
      return error;
    });
  }
}

/** 서버 오류 응답에서 읽은 값. 서버 메시지는 사용자에게 보여줄 수 있는 문장이다. */
export interface ApiFailure {
  code: string;
  message: string;
}

const fallback = "요청을 처리하지 못했습니다.";

/** 생성 SDK가 던진 값이나 네트워크 오류를 한 가지 모양으로 바꾼다 */
export function toApiFailure(error: unknown): ApiFailure {
  if (error && typeof error === "object" && "error" in error) {
    const detail = (error as { error?: { code?: unknown; message?: unknown } })
      .error;
    if (detail && typeof detail.code === "string")
      return {
        code: detail.code,
        message: typeof detail.message === "string" ? detail.message : fallback,
      };
  }
  if (error instanceof TypeError)
    return {
      code: "NETWORK",
      message: "서버 응답을 받지 못했습니다. 다시 시도하세요.",
    };
  return { code: "UNKNOWN", message: fallback };
}

export * as sdk from "./generated/sdk.gen";
export type * from "./generated/types.gen";
