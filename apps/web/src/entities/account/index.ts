import type { Tone } from "@cheddar/ui";
import { queryOptions } from "@tanstack/react-query";
import {
  type AccountDto,
  getAccountQueryKey,
  getMeQueryKey,
  listAccountsQueryKey,
  type MeDto,
  sdk,
} from "@/shared/api";

export type AccountStatus = AccountDto["status"];
export type AccountRole = AccountDto["role"];

export const accountStatusInfo: Record<
  AccountStatus,
  { label: string; tone: Tone }
> = {
  active: { label: "활성", tone: "success" },
  inactive: { label: "비활성", tone: "neutral" },
};

export const accountRoleLabel: Record<AccountRole, string> = {
  admin: "관리자",
  member: "구성원",
};

export const accountRoleOptions = (
  Object.keys(accountRoleLabel) as AccountRole[]
).map((value) => ({ value, label: accountRoleLabel[value] }));

/** 비밀번호 길이. 서버와 같은 기준이다 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** 비밀번호 길이가 맞지 않으면 고칠 방향을 알려준다 */
export const passwordLengthError = (password: string) =>
  password.length < PASSWORD_MIN_LENGTH
    ? `${PASSWORD_MIN_LENGTH}자 이상 입력하세요`
    : password.length > PASSWORD_MAX_LENGTH
      ? `${PASSWORD_MAX_LENGTH}자 이하로 입력하세요`
      : undefined;

export interface Account {
  id: string;
  name: string;
  loginId: string;
  role: AccountRole;
  status: AccountStatus;
}

export type CurrentAccount = Account;

export const isAdmin = (account: Pick<Account, "role">) =>
  account.role === "admin";

function toAccount(dto: AccountDto | MeDto): Account {
  return {
    id: dto.id,
    name: dto.name,
    loginId: dto.loginId,
    role: dto.role,
    status: dto.status,
  };
}

export const currentAccountQuery = () =>
  queryOptions({
    queryKey: getMeQueryKey(),
    queryFn: async ({ signal }) =>
      toAccount((await sdk.getMe({ signal, throwOnError: true })).data),
    staleTime: 60_000,
    retry: false,
  });

export interface AccountFilters {
  search?: string;
  role?: AccountRole;
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
