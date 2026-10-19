import {
  type Access,
  type Cell,
  type ClientMessage,
  isServerMessage,
  type OpsMessage,
  type Peer,
} from "@cheddar/contracts";
import { useEffect, useRef, useState } from "react";
import { env } from "@/shared/config/env";

export type { Peer };

/**
 * 연결이 끝난 이유. 이때는 다시 붙지 않는다.
 * - no-access: 초대가 지워졌거나 권한을 잃었다
 * - link-closed: 링크를 새로 만들었거나 비공개로 바꿨다
 * - session-expired: 로그인이 끝났다
 * - deleted: 테스트 세트가 지워졌다
 */
export type LiveClosed =
  | "no-access"
  | "link-closed"
  | "session-expired"
  | "deleted";

function closedBy(code: number, reason: string): LiveClosed | null {
  if (code === 4404) return "deleted";
  if (code !== 4403) return null;
  if (reason === "SESSION_EXPIRED") return "session-expired";
  if (reason === "LINK_REPLACED" || reason === "SHARING_CHANGED")
    return "link-closed";
  // 서버가 권한을 확인하지 못한 경우는 다시 붙어 확인한다
  if (reason === "ACCESS_CHECK_FAILED") return null;
  return "no-access";
}

export interface LiveHandlers {
  /** 지금 화면이 가진 순번. 다시 붙을 때 서버가 빠진 연산이 있는지 판단한다 */
  version: () => number;
  onOps: (message: OpsMessage & { own: boolean }) => void;
  onResync: (version: number) => void;
  onAccess?: (access: Access) => void;
}

const RETRY_MS = [1000, 2000, 5000, 10000];

/** 연결 ID. 연산 요청 헤더에 실어 내 연산을 구분한다 */
export const liveConnectionHeader = "x-cheddar-connection";

/**
 * 테스트 세트의 실시간 방에 붙는다. 다른 사람의 연산과 접속자, 셀 선택을 받는다.
 * 연산 저장은 HTTP로 하고 이 연결은 전파만 받는다.
 */
export function useLiveTestSet(path: string, handlers: LiveHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const socketRef = useRef<WebSocket | null>(null);
  const connectionId = useRef<string | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [me, setMe] = useState<Peer | null>(null);
  const [selections, setSelections] = useState<Record<string, Cell>>({});
  const [closed, setClosed] = useState<LiveClosed | null>(null);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const url = `${env.apiBaseUrl.replace(/^http/, "ws")}/api/v1/${path}/live`;

    const connect = () => {
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        const hello: ClientMessage = {
          type: "hello",
          version: handlersRef.current.version(),
        };
        socket.send(JSON.stringify(hello));
      };
      socket.onmessage = (event) => {
        let message: unknown;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!isServerMessage(message)) return;
        switch (message.type) {
          case "welcome":
            connectionId.current = message.connectionId;
            setMe(message.me);
            setPeers(message.peers);
            handlersRef.current.onAccess?.(message.access);
            break;
          case "ops":
            handlersRef.current.onOps({
              ...message,
              own: message.connectionId === connectionId.current,
            });
            break;
          case "resync":
            handlersRef.current.onResync(message.version);
            break;
          case "peers":
            setPeers(message.peers);
            setSelections((current) =>
              Object.fromEntries(
                Object.entries(current).filter(([id]) =>
                  message.peers.some((p) => p.connectionId === id),
                ),
              ),
            );
            break;
          case "selection":
            setSelections((current) => ({
              ...current,
              [message.connectionId]: message.cell,
            }));
            break;
          case "access":
            handlersRef.current.onAccess?.(message.access);
            break;
        }
      };
      socket.onclose = (event) => {
        connectionId.current = null;
        if (stopped) return;
        const reason = closedBy(event.code, event.reason);
        if (reason) return setClosed(reason);
        // 잠깐 끊긴 연결은 점점 길게 기다려 다시 붙는다
        timer = setTimeout(
          connect,
          RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)],
        );
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [path]);

  const select = (cell: Cell) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    const message: ClientMessage = { type: "select", cell };
    socket.send(JSON.stringify(message));
  };

  const others = peers.filter((p) => p.connectionId !== me?.connectionId);
  /** 다른 사람이 고른 셀(표에 이름표로 그린다) */
  const presence = others.flatMap((p) => {
    const cell = selections[p.connectionId];
    return cell
      ? [
          {
            rowId: cell.caseId,
            columnId: cell.columnId,
            name: p.name,
            color: p.color,
            guest: p.kind === "visitor",
          },
        ]
      : [];
  });

  return {
    /** 나를 포함한 접속자. 같은 사람이 여러 창이면 한 번만 */
    people: dedupe(peers),
    me,
    presence,
    select,
    closed,
    connectionId: () => connectionId.current,
  };
}

function dedupe(peers: Peer[]) {
  const seen = new Set<string>();
  return peers.filter((p) => {
    const key = `${p.kind}:${p.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
