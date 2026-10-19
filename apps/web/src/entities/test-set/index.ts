import { queryOptions } from "@tanstack/react-query";
import {
  getTestSetQueryKey,
  getTestSetViewQueryKey,
  listTestSetsQueryKey,
  sdk,
} from "@/shared/api";
import type {
  TestSet,
  TestSetFilter,
  TestSetSummary,
  ViewPreference,
} from "./model";

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
    // 편집 중인 표를 다른 창에서 돌아올 때 덮지 않는다. 공동 편집은 6단계에서 실시간으로 반영한다.
    refetchOnWindowFocus: false,
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
