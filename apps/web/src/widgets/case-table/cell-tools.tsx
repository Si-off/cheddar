import {
  ContextMenu,
  IconButton,
  Menu,
  ToolbarMenu,
  ToolbarSeparator,
} from "@cheddar/ui";
import {
  ArrowDown,
  ArrowDownFromLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  CircleChevronDown,
  ClipboardPaste,
  Copy,
  Eraser,
  ImagePlus,
  type LucideIcon,
  Redo2,
  Replace,
  Scissors,
  SquarePen,
  SquarePlus,
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
  Undo2,
} from "lucide-react";
import { Fragment } from "react";
import { type ShortcutName, shortcut } from "@/shared/lib/shortcut";

/** 고른 셀에 쓰는 작업. 없는 작업은 메뉴에 두지 않고, null이면 지금 쓸 수 없어 흐리게 둔다. */
export type CellActions = Partial<
  Record<
    | "undo"
    | "redo"
    | "cut"
    | "copy"
    | "paste"
    | "fillDown"
    | "moveUp"
    | "moveDown"
    | "clear"
    | "deleteRow"
    | "findReplace"
    | "insertAbove"
    | "insertBelow"
    | "insertDropdown"
    | "insertImage"
    | "mergeVertical"
    | "unmerge",
    (() => void) | null
  >
>;

type ActionKey = keyof CellActions;

interface Item {
  key: ActionKey;
  label: string;
  icon: LucideIcon;
  shortcut?: ShortcutName;
  danger?: boolean;
}

// 이름과 단축키는 Google 스프레드시트를 따른다
const item = {
  cut: { label: "잘라내기", icon: Scissors, shortcut: "cut" },
  copy: { label: "복사", icon: Copy, shortcut: "copy" },
  paste: { label: "붙여넣기", icon: ClipboardPaste, shortcut: "paste" },
  fillDown: {
    label: "아래로 채우기",
    icon: ArrowDownFromLine,
    shortcut: "fillDown",
  },
  moveUp: { label: "행 위로 이동", icon: ArrowUp },
  moveDown: { label: "행 아래로 이동", icon: ArrowDown },
  clear: { label: "값 삭제", icon: Eraser, shortcut: "clear" },
  deleteRow: {
    label: "행 삭제",
    icon: Trash2,
    danger: true,
    shortcut: "deleteRow",
  },
  findReplace: {
    label: "찾기 및 바꾸기",
    icon: Replace,
    shortcut: "findReplace",
  },
  insertAbove: {
    label: "위에 행 1개 삽입",
    icon: ArrowUpToLine,
    shortcut: "insertAbove",
  },
  insertBelow: { label: "아래에 행 1개 삽입", icon: ArrowDownToLine },
  insertDropdown: { label: "드롭다운", icon: CircleChevronDown },
  insertImage: { label: "셀 안에 이미지", icon: ImagePlus },
  mergeVertical: { label: "세로로 병합", icon: TableCellsMerge },
  unmerge: { label: "병합 취소", icon: TableCellsSplit },
} satisfies Record<string, Omit<Item, "key">>;

const of = (key: keyof typeof item): Item => ({ key, ...item[key] });

const editGroups: Item[][] = [
  [of("cut"), of("copy"), of("paste")],
  [of("fillDown"), of("moveUp"), of("moveDown")],
  [of("clear"), of("deleteRow")],
  [of("findReplace")],
];
const insertGroups: Item[][] = [
  [of("insertAbove"), of("insertBelow")],
  [of("insertDropdown"), of("insertImage")],
];
const mergeGroups: Item[][] = [[of("mergeVertical"), of("unmerge")]];
// 오른쪽 클릭 메뉴는 Sheets처럼 자주 쓰는 것만 둔다
const contextGroups: Item[][] = [
  [of("cut"), of("copy"), of("paste")],
  [of("insertAbove"), of("insertBelow")],
  [of("clear"), of("deleteRow")],
  [of("unmerge")],
];

function Items({
  groups,
  actions,
  Item: ItemComponent,
  Separator,
}: {
  groups: Item[][];
  actions: CellActions;
  Item: typeof Menu.Item;
  Separator: typeof Menu.Separator;
}) {
  const visible = groups
    .map((group) => group.filter((i) => actions[i.key] !== undefined))
    .filter((group) => group.length > 0);
  return visible.map((group, index) => (
    <Fragment key={group[0]?.key}>
      {index > 0 && <Separator />}
      {group.map((i) => {
        const run = actions[i.key];
        return (
          <ItemComponent
            key={i.key}
            icon={i.icon}
            tone={i.danger ? "danger" : "default"}
            shortcut={i.shortcut && shortcut(i.shortcut)}
            disabled={!run}
            onClick={() => run?.()}
          >
            {i.label}
          </ItemComponent>
        );
      })}
    </Fragment>
  ));
}

const hasAny = (groups: Item[][], actions: CellActions) =>
  groups.some((g) => g.some((i) => actions[i.key] !== undefined));

/** 표 위 도구 상자에 들어가는 셀 도구. 실행취소, 재실행, 수정·삽입·셀 병합 메뉴. */
export function CellToolbar({ actions }: { actions: CellActions }) {
  return (
    <>
      {actions.undo !== undefined && (
        <IconButton
          icon={Undo2}
          size="sm"
          label={`실행취소 (${shortcut("undo")})`}
          disabled={!actions.undo}
          onClick={() => actions.undo?.()}
        />
      )}
      {actions.redo !== undefined && (
        <IconButton
          icon={Redo2}
          size="sm"
          label={`재실행 (${shortcut("redo")})`}
          disabled={!actions.redo}
          onClick={() => actions.redo?.()}
        />
      )}
      {(actions.undo !== undefined || actions.redo !== undefined) && (
        <ToolbarSeparator />
      )}
      {hasAny(editGroups, actions) && (
        <ToolbarMenu icon={SquarePen} label="수정">
          <Items
            groups={editGroups}
            actions={actions}
            Item={Menu.Item}
            Separator={Menu.Separator}
          />
        </ToolbarMenu>
      )}
      {hasAny(insertGroups, actions) && (
        <ToolbarMenu icon={SquarePlus} label="삽입">
          <Items
            groups={insertGroups}
            actions={actions}
            Item={Menu.Item}
            Separator={Menu.Separator}
          />
        </ToolbarMenu>
      )}
      {hasAny(mergeGroups, actions) && (
        <ToolbarMenu icon={TableCellsMerge} label="셀 병합">
          <Items
            groups={mergeGroups}
            actions={actions}
            Item={Menu.Item}
            Separator={Menu.Separator}
          />
        </ToolbarMenu>
      )}
    </>
  );
}

/** 셀 오른쪽 클릭 메뉴의 항목 */
export function CellContextItems({ actions }: { actions: CellActions }) {
  return (
    <Items
      groups={contextGroups}
      actions={actions}
      Item={ContextMenu.Item}
      Separator={ContextMenu.Separator}
    />
  );
}
