import type {
  GetFileNodesResponse,
  GetFileResponse,
  GetImagesResponse,
  GetMeResponse,
} from "@figma/rest-api-spec";
import { Inject, Injectable } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../config/env";

/** token: 토큰이 틀렸거나 만료됨, missing: 링크를 볼 수 없음, unavailable: Figma에 연결하지 못함 */
export class FigmaApiError extends Error {
  constructor(readonly reason: "token" | "missing" | "unavailable") {
    super(reason);
  }
}

const TIMEOUT_MS = 60000;
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;

/** Figma REST API 호출. 응답 본문은 신뢰하지 않는 자료로 다룬다. */
@Injectable()
export class FigmaClient {
  private readonly base: string;
  constructor(@Inject(API_ENV) config: ApiEnv) {
    this.base = config.figmaApiBaseUrl ?? "https://api.figma.com";
  }
  private async get<T>(token: string, path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.base + path, {
        headers: { "X-Figma-Token": token },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new FigmaApiError("unavailable");
    }
    if (response.ok) {
      try {
        return (await response.json()) as T;
      } catch {
        throw new FigmaApiError("unavailable");
      }
    }
    const body = await response.text().catch(() => "");
    // 토큰 문제와 파일 권한 문제가 모두 403이라 본문으로 나눈다
    if (
      response.status === 401 ||
      (response.status === 403 && /token/i.test(body))
    )
      throw new FigmaApiError("token");
    if ([400, 403, 404].includes(response.status))
      throw new FigmaApiError("missing");
    throw new FigmaApiError("unavailable");
  }
  me(token: string) {
    return this.get<GetMeResponse>(token, "/v1/me");
  }
  file(token: string, fileKey: string, depth: number) {
    return this.get<GetFileResponse>(
      token,
      `/v1/files/${encodeURIComponent(fileKey)}?depth=${depth}`,
    );
  }
  nodes(token: string, fileKey: string, ids: string[], depth?: number) {
    const query = new URLSearchParams({ ids: ids.join(",") });
    if (depth) query.set("depth", String(depth));
    return this.get<GetFileNodesResponse>(
      token,
      `/v1/files/${encodeURIComponent(fileKey)}/nodes?${query}`,
    );
  }
  images(token: string, fileKey: string, ids: string[], scale: number) {
    const query = new URLSearchParams({
      ids: ids.join(","),
      format: "png",
      scale: String(scale),
    });
    return this.get<GetImagesResponse>(
      token,
      `/v1/images/${encodeURIComponent(fileKey)}?${query}`,
    );
  }
  /** 렌더링된 이미지 주소는 Figma가 준 서명 URL이라 토큰 없이 받는다 */
  async download(url: string): Promise<Buffer | null> {
    try {
      const target = new URL(url);
      if (target.protocol !== "https:" && !url.startsWith(this.base))
        return null;
      const response = await fetch(target, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      return bytes.length > MAX_DOWNLOAD_BYTES ? null : bytes;
    } catch {
      return null;
    }
  }
}
