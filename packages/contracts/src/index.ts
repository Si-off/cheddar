// HTTP와 실시간 클라이언트가 공유하는 전송 계약. 런타임 의존성은 없다.
export type CellValue = string | boolean | string[] | null;
export type ColumnDefinition = {
  name: string;
  type: "text" | "select" | "checkbox" | "tags";
  description: string;
  options: string[];
  presetKey: string | null;
};
export type CaseOp =
  | {
      type: "add_column";
      columnId: string;
      column: ColumnDefinition;
      afterColumnId: string | null;
    }
  | { type: "remove_column"; columnId: string }
  | {
      type: "update_column";
      columnId: string;
      name: string;
      description: string;
      /** 선택과 태그 열의 항목. 없으면 바꾸지 않는다. 기존 셀 값은 그대로 둔다. */
      options?: string[];
    }
  | { type: "reorder_columns"; columnIds: string[] }
  | { type: "set_cell"; caseId: string; columnId: string; value: CellValue }
  | {
      type: "add_case";
      caseId: string;
      afterCaseId: string | null;
      values?: Record<string, CellValue>;
    }
  | { type: "delete_cases"; caseIds: string[] }
  | { type: "move_case"; caseId: string; afterCaseId: string | null };
export type Actor = { kind: "account" | "visitor"; id: string; name: string };
export type Access = {
  canEdit: boolean;
  canRename: boolean;
  canDelete: boolean;
  canExport: boolean;
};
export type Peer = Actor & {
  connectionId: string;
  color: 1 | 2 | 3 | 4 | 5 | 6;
};
export type Cell = { caseId: string; columnId: string } | null;
export type ClientMessage =
  | { type: "hello"; version: number }
  | { type: "select"; cell: Cell };
export type OpsMessage = {
  type: "ops";
  version: number;
  ops: CaseOp[];
  connectionId: string | null;
  actor: Actor;
};
export type ServerMessage =
  | {
      type: "welcome";
      connectionId: string;
      me: Peer;
      peers: Peer[];
      access: Access;
    }
  | OpsMessage
  | { type: "resync"; version: number }
  | { type: "peers"; peers: Peer[] }
  | { type: "selection"; connectionId: string; cell: Cell }
  | { type: "access"; access: Access };

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const version = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const cell = (v: unknown): v is Cell =>
  v === null || (object(v) && uuid(v.caseId) && uuid(v.columnId));
const value = (v: unknown): v is CellValue =>
  v === null ||
  typeof v === "string" ||
  typeof v === "boolean" ||
  (Array.isArray(v) && v.every((x) => typeof x === "string"));
export function isCaseOp(v: unknown): v is CaseOp {
  if (!object(v)) return false;
  if (v.type === "delete_cases")
    return Array.isArray(v.caseIds) && v.caseIds.every(uuid);
  if (v.type === "remove_column") return uuid(v.columnId);
  if (v.type === "update_column")
    return (
      uuid(v.columnId) &&
      typeof v.name === "string" &&
      typeof v.description === "string" &&
      (v.options === undefined ||
        (Array.isArray(v.options) &&
          v.options.every((x) => typeof x === "string")))
    );
  if (v.type === "reorder_columns")
    return Array.isArray(v.columnIds) && v.columnIds.every(uuid);
  if (v.type === "add_column")
    return (
      uuid(v.columnId) &&
      (v.afterColumnId === null || uuid(v.afterColumnId)) &&
      object(v.column) &&
      typeof v.column.name === "string" &&
      typeof v.column.description === "string" &&
      ["text", "select", "checkbox", "tags"].includes(
        v.column.type as string,
      ) &&
      (v.column.presetKey === null || typeof v.column.presetKey === "string") &&
      Array.isArray(v.column.options) &&
      v.column.options.every((x) => typeof x === "string")
    );
  if (!uuid(v.caseId)) return false;
  if (v.type === "set_cell") return uuid(v.columnId) && value(v.value);
  if (v.type !== "add_case" && v.type !== "move_case") return false;
  if (v.afterCaseId !== null && !uuid(v.afterCaseId)) return false;
  return (
    v.type !== "add_case" ||
    v.values === undefined ||
    (object(v.values) &&
      Object.entries(v.values).every(([k, x]) => uuid(k) && value(x)))
  );
}
export function isClientMessage(v: unknown): v is ClientMessage {
  return (
    object(v) &&
    ((v.type === "hello" && version(v.version)) ||
      (v.type === "select" && cell(v.cell)))
  );
}
const actor = (v: unknown): v is Actor =>
  object(v) &&
  (v.kind === "account" || v.kind === "visitor") &&
  uuid(v.id) &&
  typeof v.name === "string";
const peer = (v: unknown): v is Peer =>
  object(v) &&
  uuid(v.connectionId) &&
  typeof v.color === "number" &&
  Number.isInteger(v.color) &&
  v.color >= 1 &&
  v.color <= 6 &&
  actor(v);
const peers = (v: unknown): v is Peer[] => Array.isArray(v) && v.every(peer);
const access = (v: unknown): v is Access =>
  object(v) &&
  ["canEdit", "canRename", "canDelete", "canExport"].every(
    (k) => typeof v[k] === "boolean",
  );
export function isServerMessage(v: unknown): v is ServerMessage {
  if (!object(v)) return false;
  switch (v.type) {
    case "welcome":
      return (
        uuid(v.connectionId) && peer(v.me) && peers(v.peers) && access(v.access)
      );
    case "ops":
      return (
        version(v.version) &&
        Array.isArray(v.ops) &&
        v.ops.every(isCaseOp) &&
        (v.connectionId === null || uuid(v.connectionId)) &&
        actor(v.actor)
      );
    case "resync":
      return version(v.version);
    case "peers":
      return peers(v.peers);
    case "selection":
      return uuid(v.connectionId) && cell(v.cell);
    case "access":
      return access(v.access);
    default:
      return false;
  }
}
