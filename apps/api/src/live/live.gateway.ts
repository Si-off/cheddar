import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import {
  type Access,
  isClientMessage,
  type OpsMessage,
  type Peer,
  type ServerMessage,
} from "@cheddar/contracts";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { isUUID } from "class-validator";
import { eq } from "drizzle-orm";
import { WebSocket, WebSocketServer } from "ws";
import { AuthService, SESSION_COOKIE } from "../auth/auth.service";
import { ApiError } from "../common/errors";
import { API_ENV, type ApiEnv } from "../config/env";
import { testSets } from "../database/schema";
import { cookie, SharedService } from "../sharing/shared.service";
import {
  type SharedSubject,
  TestSetsStore,
} from "../test-sets/test-sets.store";
import { type LiveChange, LiveEvents } from "./live-events";

type Connection = {
  ws: WebSocket;
  request: IncomingMessage;
  setId: string;
  subject: string | SharedSubject;
  peer: Peer;
  access: Access;
  ready: boolean;
};
type Room = {
  connections: Set<Connection>;
  history: OpsMessage[];
  version: number;
  tail: Promise<void>;
};
// 가변 경로 두 개를 같은 HTTP 서버의 noServer 업그레이드로 연결한다.
@Injectable()
export class LiveGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: 8192,
  });
  private readonly rooms = new Map<string, Room>();
  private timer?: NodeJS.Timeout;
  private unsubscribe?: () => void;
  private closing = false;
  constructor(
    @Inject(HttpAdapterHost) private readonly http: HttpAdapterHost,
    @Inject(TestSetsStore) private readonly store: TestSetsStore,
    @Inject(SharedService) private readonly shared: SharedService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(LiveEvents) private readonly events: LiveEvents,
  ) {}
  onApplicationBootstrap() {
    this.http.httpAdapter.getHttpServer().on("upgrade", this.upgrade);
    this.unsubscribe = this.events.subscribe((change) => this.changed(change));
    this.timer = setInterval(() => {
      void this.changed({ type: "identity" }).catch(() => {});
    }, 60_000);
    this.timer.unref();
  }
  private upgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    void this.connect(request, socket, head).catch(() => {
      if (!socket.destroyed) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      }
    });
  };
  private async connect(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) {
    if (
      this.closing ||
      !request.headers.origin ||
      !this.env.corsOrigins.includes(request.headers.origin)
    )
      throw new Error("ORIGIN_NOT_ALLOWED");
    const match = /^\/api\/v1\/(test-sets|shared)\/([^/]+)\/live$/.exec(
      new URL(request.url ?? "", "http://localhost").pathname,
    );
    if (!match) throw new Error("NOT_FOUND");
    const subject =
      match[1] === "shared"
        ? await this.shared.subject(match[2], request)
        : await this.auth.authenticate(cookie(request, SESSION_COOKIE));
    if (typeof subject === "string" && !isUUID(match[2]))
      throw new Error("NOT_FOUND");
    const resolved = await this.store.database.db.transaction((tx) =>
      this.store.visible(match[2], subject, tx, true),
    );
    if (this.closing || socket.destroyed) return;
    this.server.handleUpgrade(request, socket, head, (ws) => {
      let room = this.rooms.get(resolved.row.id);
      if (!room) {
        room = {
          connections: new Set(),
          history: [],
          version: resolved.row.version,
          tail: Promise.resolve(),
        };
        this.rooms.set(resolved.row.id, room);
      }
      const counts = [0, 0, 0, 0, 0, 0];
      for (const c of room.connections) counts[c.peer.color - 1]++;
      const color = (counts.indexOf(Math.min(...counts)) + 1) as Peer["color"];
      const connection: Connection = {
        ws,
        request,
        setId: resolved.row.id,
        subject:
          typeof subject !== "string" && resolved.actor.kind === "visitor"
            ? { ...subject, visitorId: resolved.actor.id }
            : subject,
        peer: { ...resolved.actor, connectionId: randomUUID(), color },
        access: resolved.access,
        ready: false,
      };
      room.connections.add(connection);
      ws.on("error", () => {
        ws.terminate();
      });
      ws.on("close", () => {
        room.connections.delete(connection);
        this.broadcast(room, { type: "peers", peers: this.peers(room) });
      });
      ws.on("message", (data, binary) => {
        void this.serial(room, async () => {
          if (binary) {
            ws.close(4400, "INVALID_MESSAGE");
            return;
          }
          let message: unknown;
          try {
            message = JSON.parse(data.toString());
          } catch {
            ws.close(4400, "INVALID_MESSAGE");
            return;
          }
          if (!isClientMessage(message)) {
            ws.close(4400, "INVALID_MESSAGE");
            return;
          }
          if (!(await this.revalidate(connection))) return;
          if (message.type === "hello") {
            const { row } = await this.store.visible(
              connection.setId,
              connection.subject,
            );
            const missing = room.history.filter(
              (m) => m.version > message.version && m.version <= row.version,
            );
            let expected = message.version + 1;
            const continuous = missing.every((m) => m.version === expected++);
            if (
              message.version > row.version ||
              !continuous ||
              expected !== row.version + 1
            )
              this.send(connection, { type: "resync", version: row.version });
            else for (const item of missing) this.send(connection, item);
            connection.ready = true;
          } else if (connection.ready)
            this.broadcast(room, {
              type: "selection",
              connectionId: connection.peer.connectionId,
              cell: message.cell,
            });
        }).catch((error: unknown) => {
          // 권한 판단이 끝난 오류만 권한 상실로 닫고, 조회 실패는 다시 붙게 한다
          ws.close(
            4403,
            error instanceof ApiError
              ? "ACCESS_REVOKED"
              : "ACCESS_CHECK_FAILED",
          );
        });
      });
      // 권한 검사와 upgrade 사이의 변경도 놓치지 않는다.
      void this.serial(room, async () => {
        if (!(await this.revalidate(connection))) return;
        this.send(connection, {
          type: "welcome",
          connectionId: connection.peer.connectionId,
          me: connection.peer,
          peers: this.peers(room),
          access: connection.access,
        });
        this.broadcast(room, { type: "peers", peers: this.peers(room) });
      });
    });
  }
  private serial(room: Room, action: () => Promise<void>) {
    const next = room.tail.then(action);
    room.tail = next.catch(() => {});
    return next;
  }
  private peers(room: Room) {
    return [...room.connections]
      .filter((c) => c.ws.readyState === WebSocket.OPEN)
      .map((c) => c.peer);
  }
  private send(connection: Connection, message: ServerMessage) {
    if (connection.ws.readyState !== WebSocket.OPEN) return;
    if (connection.ws.bufferedAmount > 1024 * 1024) {
      connection.ws.close(4413, "SLOW_CONSUMER");
      return;
    }
    connection.ws.send(JSON.stringify(message));
  }
  private broadcast(room: Room, message: ServerMessage) {
    for (const c of room.connections) this.send(c, message);
  }
  private async revalidate(connection: Connection, reason = "ACCESS_REVOKED") {
    if (connection.ws.readyState !== WebSocket.OPEN) return false;
    try {
      const accountId =
        typeof connection.subject === "string"
          ? connection.subject
          : connection.subject.accountId;
      if (
        accountId &&
        (await this.auth.authenticate(
          cookie(connection.request, SESSION_COOKIE),
        )) !== accountId
      )
        throw new Error("SESSION_EXPIRED");
      const resolved = await this.store.visible(
        connection.setId,
        connection.subject,
      );
      if (resolved.actor.id !== connection.peer.id)
        throw new Error("LINK_REPLACED");
      if (
        JSON.stringify(resolved.access) !== JSON.stringify(connection.access)
      ) {
        connection.access = resolved.access;
        this.send(connection, { type: "access", access: resolved.access });
      }
      if (resolved.actor.name !== connection.peer.name) {
        connection.peer.name = resolved.actor.name;
        const room = this.rooms.get(connection.setId);
        if (room)
          this.broadcast(room, { type: "peers", peers: this.peers(room) });
      }
      return true;
    } catch (error) {
      // 권한 판단이 끝난 오류만 그 사유로 닫고, 조회 자체가 실패했으면 다시 붙게 한다
      if (error instanceof ApiError && error.code === "LINK_NOT_FOUND")
        reason = "LINK_REPLACED";
      else if (error instanceof Error && error.message === "LINK_REPLACED")
        reason = "LINK_REPLACED";
      else if (
        !(error instanceof ApiError) &&
        !(error instanceof Error && error.message === "SESSION_EXPIRED")
      )
        reason = "ACCESS_CHECK_FAILED";
      let exists = true;
      try {
        const [row] = await this.store.database.db
          .select({ id: testSets.id })
          .from(testSets)
          .where(eq(testSets.id, connection.setId));
        exists = !!row;
      } catch {
        reason = "ACCESS_CHECK_FAILED";
      }
      connection.ws.close(
        exists ? 4403 : 4404,
        exists
          ? (error instanceof ApiError && error.code === "UNAUTHENTICATED") ||
            (error instanceof Error && error.message === "SESSION_EXPIRED")
            ? "SESSION_EXPIRED"
            : reason
          : "TEST_SET_DELETED",
      );
      return false;
    }
  }
  private async changed(change: LiveChange) {
    const entries =
      change.type === "identity"
        ? [...this.rooms.entries()]
        : [...this.rooms.entries()].filter(([id]) => id === change.testSetId);
    await Promise.all(
      entries.map(([id, room]) =>
        this.serial(room, async () => {
          for (const connection of room.connections) {
            if (
              change.type === "resync" &&
              change.closeLinks &&
              typeof connection.subject !== "string"
            )
              connection.ws.close(4403, change.reason ?? "LINK_REPLACED");
            else
              await this.revalidate(
                connection,
                change.type === "resync" ? change.reason : undefined,
              );
          }
          if (change.type === "identity") return;
          if (change.type === "ops") {
            const { testSetId: _id, ...message } = change;
            if (
              message.connectionId &&
              ![...room.connections].some(
                (c) =>
                  c.peer.connectionId === message.connectionId &&
                  c.peer.kind === message.actor.kind &&
                  c.peer.id === message.actor.id,
              )
            )
              message.connectionId = null;
            if (message.version !== room.version + 1) {
              room.history = [];
              room.version = Math.max(room.version, message.version);
              this.broadcast(room, { type: "resync", version: room.version });
              return;
            }
            room.version = Math.max(room.version, message.version);
            room.history.push(message);
            if (room.history.length > 500) room.history.shift();
            this.broadcast(room, message);
          } else {
            const [row] = await this.store.database.db
              .select({ version: testSets.version })
              .from(testSets)
              .where(eq(testSets.id, id));
            room.history = [];
            if (row) {
              room.version = row.version;
              this.broadcast(room, { type: "resync", version: row.version });
            }
          }
        }),
      ),
    );
  }
  onModuleDestroy() {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    this.unsubscribe?.();
    this.http.httpAdapter.getHttpServer()?.off("upgrade", this.upgrade);
    for (const client of this.server.clients) {
      client.close(1001, "SERVER_SHUTDOWN");
      client.terminate();
    }
    this.server.close();
    this.rooms.clear();
  }
}
