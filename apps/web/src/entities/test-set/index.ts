import { queryOptions } from "@tanstack/react-query";
import {
  getTestSetQueryKey,
  getTestSetViewQueryKey,
  listTestSetsQueryKey,
  sdk,
} from "@/shared/api";
import type {
  SharedTestSet,
  TestSet,
  TestSetFilter,
  TestSetSummary,
  ViewPreference,
} from "./model";

export * from "./cell-field";
export * from "./model";

export const testSetsQuery = (filter: TestSetFilter, search: string) =>
  queryOptions({
    queryKey: listTestSetsQueryKey({ query: { filter, search } }),
    queryFn: async ({ signal }): Promise<TestSetSummary[]> =>
      (
        await sdk.listTestSets({
          query: { filter, search },
          signal,
          throwOnError: true,
        })
      ).data.items,
  });

export const testSetQuery = (testSetId: string) =>
  queryOptions({
    queryKey: getTestSetQueryKey({ path: { testSetId } }),
    queryFn: async ({ signal }): Promise<TestSet> =>
      (
        await sdk.getTestSet({
          path: { testSetId },
          signal,
          throwOnError: true,
        })
      ).data,
    // 편집 중인 표를 다른 창에서 돌아올 때 덮지 않는다. 다른 사람의 변경은 실시간 연결로 받는다.
    refetchOnWindowFocus: false,
  });

export const sharedTestSetQuery = (linkToken: string) =>
  queryOptions({
    queryKey: ["shared-test-set", linkToken],
    queryFn: async ({ signal }): Promise<SharedTestSet> =>
      (
        await sdk.getSharedTestSet({
          path: { linkToken },
          signal,
          throwOnError: true,
        })
      ).data,
    refetchOnWindowFocus: false,
    retry: false,
  });

export const testSetViewQuery = (testSetId: string) =>
  queryOptions({
    queryKey: getTestSetViewQueryKey({ path: { testSetId } }),
    queryFn: async ({ signal }): Promise<ViewPreference> =>
      (
        await sdk.getTestSetView({
          path: { testSetId },
          signal,
          throwOnError: true,
        })
      ).data,
    refetchOnWindowFocus: false,
  });
