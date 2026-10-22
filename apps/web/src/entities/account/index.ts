import type { Tone } from "@cheddar/ui";
import { queryOptions } from "@tanstack/react-query";
import type { PermissionGrant } from "@/entities/permission";
import {
  type AccountDto,
  getAccountQueryKey,
  getMeQueryKey,
  listAccountsQueryKey,
  type MeDto,
  sdk,
} from "@/shared/api";

export type AccountStatus = AccountDto["status"];

export const accountStatusInfo: Record<
  AccountStatus,
  { label: string; tone: Tone }
> = {
  invited: { label: "초대됨", tone: "info" },
  active: { label: "활성", tone: "success" },
  expired: { label: "만료", tone: "warning" },
  inactive: { label: "비활성", tone: "neutral" },
};

export interface Assignment {
  roleId: string;
  scope: "global" | "projects";
  projectIds: string[];
}

export interface Account {
  id: string;
  name: string;
  loginId: string;
  affiliation: { id: string; name: string };
  status: AccountStatus;
  /** YYYY-MM-DD 또는 없음 */
  expiresOn: string | null;
  assignments: Assignment[];
  /** 할당된 역할이 만료일을 요구할 때의 기본 기간(일) */
  defaultExpiryDays: number | null;
}

export interface CurrentAccount extends Account {
  permissions: PermissionGrant[];
}

function toLocalDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toAccount(dto: AccountDto): Account {
  return {
    id: dto.id,
    name: dto.name,
    loginId: dto.loginId,
    affiliation: dto.affiliation,
    status: dto.status,
    expiresOn: dto.expiresAt ? toLocalDate(dto.expiresAt) : null,
    assignments: dto.assignments.map((a) => ({
      roleId: a.roleId,
      scope: a.scope,
      projectIds: [...a.projectIds],
    })),
    defaultExpiryDays: dto.defaultExpiryDays,
  };
}

function toCurrentAccount(dto: MeDto): CurrentAccount {
  return {
    ...toAccount(dto),
    permissions: dto.permissions.map((p) => ({
      key: p.permission,
      scope: p.scope,
      projectIds: [...p.projectIds],
    })),
  };
}

/** 날짜 칸 값(YYYY-MM-DD)을 서버가 받는 시각으로 바꾼다. 그날이 끝날 때까지 쓸 수 있게 한다. */
export function expiryToApi(expiresOn: string | null) {
  return expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null;
}

export const currentAccountQuery = () =>
  queryOptions({
    queryKey: getMeQueryKey(),
    queryFn: async ({ signal }) =>
      toCurrentAccount((await sdk.getMe({ signal, throwOnError: true })).data),
    staleTime: 60_000,
    retry: false,
  });

export interface AccountFilters {
  search?: string;
  roleId?: string;
  affiliationId?: string;
  status?: AccountStatus;
}

/** 서버가 한 번에 돌려주는 최대 개수 */
export const ACCOUNTS_PAGE_SIZE = 100;

/** page는 0부터 센다 */
export const accountsQuery = (filters: AccountFilters, page = 0) =>
  queryOptions({
    queryKey: listAccountsQueryKey({
      query: {
        ...filters,
        limit: ACCOUNTS_PAGE_SIZE,
        offset: page * ACCOUNTS_PAGE_SIZE,
      },
    }),
    queryFn: async ({ signal }) => {
      const { data } = await sdk.listAccounts({
        query: {
          ...filters,
          limit: ACCOUNTS_PAGE_SIZE,
          offset: page * ACCOUNTS_PAGE_SIZE,
        },
        signal,
        throwOnError: true,
      });
      return { items: data.items.map(toAccount), total: data.total, page };
    },
  });

export const accountQuery = (accountId: string) =>
  queryOptions({
    queryKey: getAccountQueryKey({ path: { accountId } }),
    queryFn: async ({ signal }) =>
      toAccount(
        (
          await sdk.getAccount({
            path: { accountId },
            signal,
            throwOnError: true,
          })
        ).data,
      ),
  });

export { toAccount };
