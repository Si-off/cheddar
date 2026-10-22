import type { Page, Route, WebSocketRoute } from "@playwright/test";
import type { AccountDto, MeDto } from "../api/generated/types.gen";

/** e2e 전용: 브라우저에서 API 응답을 합성한다. 실제 서버 없이 화면 동작을 검증한다. */
export const API = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:3101";
/** 웹 주소. 직접 route를 만들 때 CORS 허용 출처로 쓴다(playwright.config의 baseURL과 같다). */
export const WEB_ORIGIN =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5176";

export function account(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: "a1",
    name: "최하늘",
    loginId: "haneul.choi",
    role: "admin",
    status: "active",
    createdAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

/** 로그인한 내 계정. 기본은 관리자다 */
export function me(overrides: Partial<AccountDto> = {}): MeDto {
  const { createdAt: _, ...rest } = account(overrides);
  return rest;
}

type Handler = (route: Route, body: unknown) => unknown;

const REPLY = Symbol("reply");
/** 상태 코드를 직접 정할 때 쓴다. 그냥 값을 주면 200 응답 본문이 된다. */
export function reply(status: number, json?: unknown) {
  return { [REPLY]: true, status, json };
}

/**
 * 경로("METHOD /path")별 응답. 함수면 요청 본문을 받아 응답 본문을 돌려준다.
 * 실시간 연결은 실제 서버로 가지 않게 막고, live가 있으면 그 연결을 넘긴다.
 */
export async function mockApi(
  page: Page,
  handlers: Record<string, unknown | Handler>,
  options: { live?: (ws: WebSocketRoute) => void } = {},
) {
  const calls: Array<{ key: string; body: unknown }> = [];
  await page.routeWebSocket(/\/live$/, (ws) => options.live?.(ws));
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    const headers = {
      "access-control-allow-origin": new URL(page.url() || "http://127.0.0.1")
        .origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type, x-cheddar-connection",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const body = request.postDataJSON?.() ?? null;
    calls.push({ key, body });
    const handler = handlers[key];
    if (handler === undefined) {
      return route.fulfill({
        status: 404,
        headers,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "NOT_FOUND",
            message: "요청 항목을 찾지 못했습니다.",
            requestId: "t",
          },
        }),
      });
    }
    const result =
      typeof handler === "function"
        ? await (handler as Handler)(route, body)
        : handler;
    const { status, json } =
      result && typeof result === "object" && REPLY in result
        ? (result as unknown as { status: number; json?: unknown })
        : { status: 200, json: result };
    return route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: json === undefined ? "" : JSON.stringify(json),
    });
  });
  return calls;
}

export const unauthenticated = reply(401, {
  error: {
    code: "UNAUTHENTICATED",
    message: "로그인이 필요합니다.",
    requestId: "t",
  },
});
