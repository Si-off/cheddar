import { Inject, Injectable } from "@nestjs/common";
import {
  buildScreenDocument,
  type ScreenDocument,
  type SourceNode,
} from "@workspace/contracts";
import { eq, sql } from "drizzle-orm";
import { AuthorizationService } from "../authorization/authorization.service";
import { ApiError, invalid } from "../common/errors";
import type { FigmaTokenStatusDto } from "../contracts/figma.dto";
import { DatabaseService } from "../database/database.service";
import { figmaTokens } from "../database/schema";
import { toTiles } from "../temp-uploads/images";
import { FigmaApiError, FigmaClient } from "./figma-client";
import { parseFigmaLink } from "./figma-link";
import { FigmaTokenCipher } from "./token-cipher";

export type FigmaFrame = {
  name: string;
  document: ScreenDocument;
  images: Buffer[];
};

const tokenRequired = () =>
  new ApiError(409, "FIGMA_TOKEN_REQUIRED", "Figma 토큰을 등록해주세요.");
const tokenInvalid = (status = 409) =>
  new ApiError(
    status,
    "FIGMA_TOKEN_INVALID",
    "Figma 토큰을 확인하지 못했습니다.",
  );
const linkUnavailable = () =>
  new ApiError(404, "FIGMA_LINK_UNAVAILABLE", "볼 수 없는 Figma 링크입니다.");
const figmaUnavailable = () =>
  new ApiError(
    503,
    "FIGMA_UNAVAILABLE",
    "Figma에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
  );

// 플러그인과 같이 보드로 올리는 노드. 섹션과 페이지는 안의 보드로 펼친다
const BOARDS = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE"]);
const CONTAINERS = new Set(["CANVAS", "SECTION"]);
const NODE_CHUNK = 10;
const IMAGE_CHUNK = 50;
const SCALES = [1, 0.5, 0.25];

type ListedNode = {
  id: string;
  name: string;
  type: string;
  children?: ListedNode[];
};

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

@Injectable()
export class FigmaService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
    @Inject(FigmaClient) private readonly client: FigmaClient,
    @Inject(FigmaTokenCipher) private readonly cipher: FigmaTokenCipher,
  ) {}

  private call<T>(work: Promise<T>, onToken = tokenInvalid): Promise<T> {
    return work.catch((error) => {
      if (!(error instanceof FigmaApiError)) throw error;
      if (error.reason === "token") throw onToken();
      if (error.reason === "missing") throw linkUnavailable();
      throw figmaUnavailable();
    });
  }

  async status(accountId: string): Promise<FigmaTokenStatusDto> {
    await this.authorization.active(accountId);
    const [row] = await this.database.db
      .select()
      .from(figmaTokens)
      .where(eq(figmaTokens.accountId, accountId));
    return {
      token: row
        ? {
            handle: row.figmaHandle,
            email: row.figmaEmail,
            tokenSuffix: row.tokenSuffix,
          }
        : null,
    };
  }

  /** Figma에서 토큰을 확인한 뒤 저장한다. 이미 있으면 바꾼다. */
  async save(accountId: string, value: string) {
    await this.authorization.active(accountId);
    const token = value.trim();
    if (!token || /\s/.test(token)) throw invalid();
    const me = await this.call(this.client.me(token), () => tokenInvalid(400));
    const row = {
      encryptedToken: await this.cipher.encrypt(token),
      tokenSuffix: token.slice(-4),
      figmaHandle: me.handle,
      figmaEmail: me.email,
    };
    await this.database.db
      .insert(figmaTokens)
      .values({ accountId, ...row })
      .onConflictDoUpdate({
        target: figmaTokens.accountId,
        set: { ...row, updatedAt: sql`now()` },
      });
    return this.status(accountId);
  }

  async remove(accountId: string) {
    await this.authorization.active(accountId);
    await this.database.db
      .delete(figmaTokens)
      .where(eq(figmaTokens.accountId, accountId));
  }

  private async token(accountId: string) {
    const [row] = await this.database.db
      .select({ encryptedToken: figmaTokens.encryptedToken })
      .from(figmaTokens)
      .where(eq(figmaTokens.accountId, accountId));
    if (!row) throw tokenRequired();
    try {
      return await this.cipher.decrypt(row.encryptedToken);
    } catch {
      // 저장소 키가 바뀌어 읽을 수 없으면 다시 등록하게 한다
      throw tokenInvalid();
    }
  }

  /**
   * 링크가 가리키는 보드를 플러그인과 같은 화면 문서와 이미지로 읽는다.
   * 프레임 링크는 그 프레임, 섹션은 안의 프레임, 페이지와 파일은 최상위 프레임을 읽는다.
   * limit을 넘는 보드는 읽지 않고 개수만 돌려준다. 이미지를 받지 못한 보드는 문서만 올린다.
   */
  async readLink(
    accountId: string,
    url: string,
    limit: number,
  ): Promise<{ title: string; frames: FigmaFrame[]; omittedCount: number }> {
    const { fileKey, nodeId } = parseFigmaLink(url);
    const token = await this.token(accountId);
    const names: Record<string, string> = {};
    const boards: ListedNode[] = [];
    const pending: string[] = [];
    let title = "";
    const place = (node: ListedNode, linked = false) => {
      names[node.id] = node.name;
      if (BOARDS.has(node.type) || (linked && !CONTAINERS.has(node.type))) {
        boards.push(node);
        return;
      }
      if (!CONTAINERS.has(node.type)) return;
      // depth로 자른 응답은 안쪽 섹션의 자식이 없어 다시 읽는다
      if (node.children) for (const child of node.children) place(child);
      else pending.push(node.id);
    };
    if (nodeId) {
      const top = await this.call(
        this.client.nodes(token, fileKey, [nodeId], 1),
      );
      const node = top.nodes?.[nodeId]?.document as ListedNode | undefined;
      if (!node) throw linkUnavailable();
      title = node.name;
      place(node, true);
    } else {
      const file = await this.call(this.client.file(token, fileKey, 2));
      title = file.name;
      for (const page of (file.document as ListedNode).children ?? [])
        place(page);
    }
    // 한도를 넘어도 목록은 끝까지 펼쳐 넣지 못한 보드 수를 정확히 알린다
    while (pending.length) {
      const ids = pending.splice(0, NODE_CHUNK);
      const read = await this.call(this.client.nodes(token, fileKey, ids, 1));
      for (const id of ids) {
        const node = read.nodes?.[id]?.document as ListedNode | undefined;
        if (node) for (const child of node.children ?? []) place(child);
      }
    }
    // 프레임이 없는 페이지나 파일도 읽을 자료가 없어 볼 수 없는 링크로 알린다
    if (!boards.length) throw linkUnavailable();
    const chosen = boards.slice(0, limit);
    const sources = new Map<string, SourceNode>();
    for (const ids of chunks(
      chosen.map((b) => b.id),
      NODE_CHUNK,
    )) {
      const read = await this.call(this.client.nodes(token, fileKey, ids));
      for (const id of ids) {
        const node = read.nodes?.[id]?.document;
        if (node) sources.set(id, node as SourceNode);
      }
    }
    // 보드 밖으로 이어지는 연결도 이름을 알아야 화면 문서에 남는다(플러그인과 같다)
    const outside = new Set<string>();
    const collect = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const value = node as {
        interactions?: { actions?: ({ destinationId?: string } | null)[] }[];
        connectorStart?: { endpointNodeId?: string };
        connectorEnd?: { endpointNodeId?: string };
        children?: unknown[];
      };
      for (const r of value.interactions ?? [])
        for (const action of r.actions ?? [])
          if (action?.destinationId) outside.add(action.destinationId);
      for (const end of [value.connectorStart, value.connectorEnd])
        if (end?.endpointNodeId) outside.add(end.endpointNodeId);
      for (const child of value.children ?? []) collect(child);
    };
    for (const source of sources.values()) collect(source);
    const unnamed = [...outside].filter((id) => !(id in names));
    for (const ids of chunks(unnamed, IMAGE_CHUNK)) {
      // 이름만 필요하다. 지워졌거나 볼 수 없는 대상은 연결을 남기지 않는다
      const read = await this.client
        .nodes(token, fileKey, ids, 1)
        .catch(() => null);
      for (const id of ids) {
        const name = read?.nodes?.[id]?.document?.name;
        if (name) names[id] = name;
      }
    }
    const images = await this.render(
      token,
      fileKey,
      chosen.map((b) => b.id),
    );
    const frames: FigmaFrame[] = [];
    for (const board of chosen) {
      const source = sources.get(board.id);
      if (!source) continue;
      const document = buildScreenDocument(source, { externalNames: names });
      frames.push({
        name: document.board.name || board.name,
        document,
        images: images.get(board.id) ?? [],
      });
    }
    if (!frames.length) throw linkUnavailable();
    return { title, frames, omittedCount: boards.length - chosen.length };
  }

  /** 보드를 PNG로 렌더링해 타일로 나눈다. Figma가 그리지 못한 큰 보드는 줄여서 다시 요청한다. */
  private async render(token: string, fileKey: string, ids: string[]) {
    const result = new Map<string, Buffer[]>();
    let left = ids;
    for (const scale of SCALES) {
      const failed: string[] = [];
      for (const group of chunks(left, IMAGE_CHUNK)) {
        const read = await this.call(
          this.client.images(token, fileKey, group, scale),
        );
        for (const id of group) {
          const url = read.images?.[id];
          const bytes = url ? await this.client.download(url) : null;
          const tiles = bytes ? await toTiles(bytes).catch(() => null) : null;
          if (tiles?.length) result.set(id, tiles);
          else failed.push(id);
        }
      }
      left = failed;
      if (!left.length) break;
    }
    return result;
  }
}
