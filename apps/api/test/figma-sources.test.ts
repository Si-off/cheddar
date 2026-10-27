import "reflect-metadata";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { createApp } from "../src/common/application";
import type {
  FigmaTokenStatusDto,
  TempUploadAddedDto,
} from "../src/contracts/figma.dto";
import { figmaTokens, tempFrames, tempUploads } from "../src/database/schema";
import { parseFigmaLink } from "../src/figma/figma-link";
import { LocalStorage } from "../src/storage/local-storage";
import { openTestDatabase } from "./database";

const FILE = "FigmaFile0001";
const at = (x: number, y: number, width: number, height: number) => ({
  absoluteBoundingBox: { x, y, width, height },
});
const text = (id: string, characters: string, y: number) => ({
  id,
  name: characters,
  type: "TEXT",
  characters,
  ...at(0, y, 200, 20),
});
const frame = (id: string, name: string, height = 800) => ({
  id,
  name,
  type: "FRAME",
  ...at(0, 0, 400, height),
  children: [text(`${id}t`, `${name} 제목`, 10)],
});
// 페이지 안에 프레임 하나와 프레임 두 개가 든 섹션, 프레임이 아닌 레이어가 있다
const nodes: Record<string, Record<string, unknown>> = {
  // 페이지 밖 프레임으로 이어지는 연결
  "1:1": {
    ...frame("1:1", "로그인"),
    interactions: [
      { trigger: { type: "ON_CLICK" }, actions: [{ destinationId: "5:5" }] },
    ],
  },
  "5:5": frame("5:5", "약관 상세"),
  "1:2": frame("1:2", "회원가입", 3000),
  "1:3": frame("1:3", "약관 동의"),
  "2:1": {
    id: "2:1",
    name: "가입 흐름",
    type: "SECTION",
    children: [{ id: "1:2" }, { id: "1:3" }],
  },
  "0:1": {
    id: "0:1",
    name: "화면",
    type: "CANVAS",
    children: [{ id: "1:1" }, { id: "2:1" }, { id: "9:9" }],
  },
  "9:9": { id: "9:9", name: "메모", type: "TEXT", characters: "메모" },
};
// depth=1은 바로 아래 자식까지만, depth가 없으면 전체 트리를 준다
const shallow = (id: string) => {
  const node = nodes[id];
  const children = (node?.children as { id: string }[] | undefined)?.map(
    (c) => {
      const child = nodes[c.id] ?? {};
      const { children: _, ...rest } = child;
      return child.type === "SECTION" ? rest : child;
    },
  );
  return children ? { ...node, children } : node;
};

test("Figma 토큰과 링크, 화면 이미지로 플러그인 없이 임시 업로드를 만든다", {
  timeout: 60000,
}, async () => {
  let revoked = false;
  const figma = createServer(async (req, res) => {
    const url = new URL(req.url ?? "", "http://figma.test");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname.startsWith("/render/")) {
      const id = decodeURIComponent(url.pathname.slice(8));
      const box = nodes[id]?.absoluteBoundingBox as
        | { height: number }
        | undefined;
      const height = box?.height ?? 100;
      const png = await sharp({
        create: { width: 400, height, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer();
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(png);
      return;
    }
    const token = req.headers["x-figma-token"];
    if (token !== "figd_good-token-1234" || revoked)
      return send(403, { status: 403, err: "Invalid token" });
    if (url.pathname === "/v1/me")
      return send(200, { id: "1", handle: "최하늘", email: "h@example.com" });
    if (url.pathname === "/v1/files/Locked000001/nodes")
      return send(403, { status: 403, err: "Forbidden" });
    if (url.pathname === `/v1/files/${FILE}/nodes`) {
      const ids = (url.searchParams.get("ids") ?? "").split(",");
      const depth = url.searchParams.get("depth");
      return send(200, {
        nodes: Object.fromEntries(
          ids.map((id) => [
            id,
            nodes[id] ? { document: depth ? shallow(id) : nodes[id] } : null,
          ]),
        ),
      });
    }
    if (url.pathname === `/v1/images/${FILE}`) {
      const base = `http://127.0.0.1:${(figma.address() as AddressInfo).port}`;
      const ids = (url.searchParams.get("ids") ?? "").split(",");
      return send(200, {
        images: Object.fromEntries(
          ids.map((id) => [id, `${base}/render/${encodeURIComponent(id)}`]),
        ),
      });
    }
    send(404, { status: 404, err: "Not found" });
  });
  await new Promise<void>((resolve) => figma.listen(0, "127.0.0.1", resolve));
  const lease = await openTestDatabase();
  const app = await createApp(
    {
      ...lease.config,
      workersEnabled: false,
      figmaApiBaseUrl: `http://127.0.0.1:${(figma.address() as AddressInfo).port}`,
    },
    lease.folder,
  );
  const db = lease.database.db;
  try {
    await app.get(LocalStorage).initialize();
    await app.listen(0, "127.0.0.1");
    const base = `${await app.getUrl()}/api/v1`;
    const accounts = app.get(AccountsService);
    const auth = app.get(AuthService);
    const admin = await createFirstAdministrator(
      app.get(AuthorizationService),
      accounts,
      "figma-admin@example.com",
      "Figma 관리자",
    );
    lease.accountIds.push(admin.account.id);
    const password = "피그마-테스트-비밀번호-12345";
    await accounts.resetPassword(admin.account.id, password);
    const cookie = `${SESSION_COOKIE}=${(await auth.login(admin.account.loginId, password)).token}`;
    const other = await accounts.create({
      name: "토큰 없는 사람",
      loginId: "figma-other@example.com",
      role: "member",
      password,
    });
    lease.accountIds.push(other.id);
    const otherCookie = `${SESSION_COOKIE}=${(await auth.login(other.loginId, password)).token}`;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      actor = cookie,
    ) =>
      fetch(base + path, {
        method,
        headers: {
          Cookie: actor,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const json = async <T>(response: Response, status = 200): Promise<T> => {
      assert.equal(response.status, status, await response.clone().text());
      return (await response.json()) as T;
    };
    const error = async (response: Response, status: number, code: string) =>
      assert.equal(
        (await json<{ error: { code: string } }>(response, status)).error.code,
        code,
      );
    const link = (nodeId?: string, key = FILE) =>
      `https://www.figma.com/design/${key}/Sample${nodeId ? `?node-id=${nodeId.replace(":", "-")}` : ""}`;

    // 토큰은 Figma에서 확인한 뒤 암호화해 저장하고 끝 네 글자만 보인다
    assert.deepEqual(
      await json<FigmaTokenStatusDto>(await request("/figma-token")),
      { token: null },
    );
    await error(
      await request("/figma-token", "PUT", { token: "figd_wrong" }),
      400,
      "FIGMA_TOKEN_INVALID",
    );
    assert.deepEqual(
      await json<FigmaTokenStatusDto>(
        await request("/figma-token", "PUT", {
          token: " figd_good-token-1234 ",
        }),
      ),
      {
        token: {
          handle: "최하늘",
          email: "h@example.com",
          tokenSuffix: "1234",
        },
      },
    );
    const [stored] = await db
      .select()
      .from(figmaTokens)
      .where(eq(figmaTokens.accountId, admin.account.id));
    assert.ok(stored && !stored.encryptedToken.includes("good-token"));

    // 토큰이 없거나 링크가 틀리면 업로드를 만들지 않는다
    await error(
      await request(
        "/temp-uploads/figma",
        "POST",
        { url: link("0:1") },
        otherCookie,
      ),
      409,
      "FIGMA_TOKEN_REQUIRED",
    );
    await error(
      await request("/temp-uploads/figma", "POST", {
        url: "https://example.com/design/abc",
      }),
      400,
      "FIGMA_LINK_INVALID",
    );
    await error(
      await request("/temp-uploads/figma", "POST", {
        url: link("1:1", "Locked000001"),
      }),
      404,
      "FIGMA_LINK_UNAVAILABLE",
    );
    assert.equal(
      (
        await db
          .select()
          .from(tempUploads)
          .where(eq(tempUploads.accountId, admin.account.id))
      ).length,
      0,
    );

    // 페이지 링크는 섹션 안까지 프레임만 읽고, 긴 프레임은 타일로 나눈다
    const page = await json<TempUploadAddedDto>(
      await request("/temp-uploads/figma", "POST", { url: link("0:1") }),
      201,
    );
    assert.deepEqual(
      page.upload.frames.map((f) => [f.name, f.imageCount]),
      [
        ["로그인", 1],
        ["회원가입", 2],
        ["약관 동의", 1],
      ],
    );
    assert.equal(page.title, "화면");
    assert.equal(page.addedFrameIds.length, 3);
    assert.equal(page.omittedCount, 0);
    const [saved] = await db
      .select()
      .from(tempFrames)
      .where(eq(tempFrames.id, page.addedFrameIds[0] ?? ""));
    const document = JSON.parse(saved?.screenDocument ?? "{}");
    assert.equal(document.schemaVersion, 2);
    assert.deepEqual(document.texts, ["로그인 제목"]);
    assert.deepEqual(document.links, [
      { from: "로그인", to: "약관 상세", trigger: "ON_CLICK" },
    ]);
    const thumbnail = await request(
      `/temp-uploads/${page.upload.id}/frames/${page.addedFrameIds[0]}/thumbnail`,
    );
    assert.equal(thumbnail.headers.get("content-type"), "image/png");

    // 같은 업로드에 프레임 링크와 이미지를 이어 붙인다
    const single = await json<TempUploadAddedDto>(
      await request("/temp-uploads/figma", "POST", {
        url: link("1:3"),
        uploadId: page.upload.id,
      }),
      201,
    );
    assert.equal(single.upload.id, page.upload.id);
    assert.equal(single.upload.frames.length, 4);
    assert.deepEqual(single.addedFrameIds, [single.upload.frames[3]?.id]);

    const form = new FormData();
    form.append("uploadId", page.upload.id);
    const tall = await sharp({
      create: { width: 300, height: 3000, channels: 3, background: "#eee" },
    })
      .webp()
      .toBuffer();
    const small = await sharp({
      create: { width: 300, height: 600, channels: 3, background: "#ddd" },
    })
      .jpeg()
      .toBuffer();
    form.append(
      "images[]",
      new Blob([tall], { type: "image/webp" }),
      "마이페이지 설계서.webp",
    );
    form.append(
      "images[]",
      new Blob([small], { type: "image/jpeg" }),
      "알림.jpg",
    );
    const images = await json<TempUploadAddedDto>(
      await fetch(`${base}/temp-uploads/images`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: form,
      }),
      201,
    );
    assert.deepEqual(
      images.upload.frames.slice(4).map((f) => [f.name, f.imageCount]),
      [
        ["마이페이지 설계서.webp", 2],
        ["알림.jpg", 1],
      ],
    );
    const wrong = new FormData();
    wrong.append(
      "images[]",
      new Blob(["글자"], { type: "image/png" }),
      "a.png",
    );
    await error(
      await fetch(`${base}/temp-uploads/images`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: wrong,
      }),
      400,
      "VALIDATION_ERROR",
    );

    // 다른 사람 업로드나 생성이 가져간 업로드에는 붙이지 않는다
    await error(
      await request(
        "/temp-uploads/figma",
        "POST",
        { url: link("1:1"), uploadId: page.upload.id },
        otherCookie,
      ),
      404,
      "NOT_FOUND",
    );
    await db
      .update(tempUploads)
      .set({ claimedAt: new Date() })
      .where(eq(tempUploads.id, page.upload.id));
    await error(
      await request("/temp-uploads/figma", "POST", {
        url: link("1:1"),
        uploadId: page.upload.id,
      }),
      404,
      "NOT_FOUND",
    );
    await db
      .update(tempUploads)
      .set({ claimedAt: null })
      .where(eq(tempUploads.id, page.upload.id));

    // 저장한 토큰이 만료되면 다시 등록하도록 알린다
    revoked = true;
    await error(
      await request("/temp-uploads/figma", "POST", { url: link("1:1") }),
      409,
      "FIGMA_TOKEN_INVALID",
    );
    revoked = false;

    assert.equal((await request("/figma-token", "DELETE")).status, 204);
    assert.deepEqual(
      await json<FigmaTokenStatusDto>(await request("/figma-token")),
      { token: null },
    );
  } finally {
    try {
      await app.close();
    } finally {
      await lease.close();
      figma.close();
    }
  }
});

test("Figma 링크에서 파일 키와 노드 ID를 읽는다", () => {
  assert.deepEqual(
    parseFigmaLink(
      "https://www.figma.com/design/AbCdEf1234567/Sample?node-id=12-34&t=x",
    ),
    { fileKey: "AbCdEf1234567", nodeId: "12:34" },
  );
  assert.deepEqual(
    parseFigmaLink(
      "https://www.figma.com/design/AbCdEf1234567/branch/BrAnCh123456/Sample",
    ),
    { fileKey: "BrAnCh123456", nodeId: null },
  );
  for (const url of [
    "http://www.figma.com/design/AbCdEf1234567/x",
    "https://figma.com.evil.test/design/AbCdEf1234567/x",
    "https://www.figma.com/board/AbCdEf1234567/x",
    "figma 링크",
  ])
    assert.throws(() => parseFigmaLink(url));
});
