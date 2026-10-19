import { queryOptions } from "@tanstack/react-query";
import {
  getCurrentGenerationQueryKey,
  getTempUploadQueryKey,
  listReviewItemsQueryKey,
  sdk,
} from "@/shared/api";
import type { Generation, ReviewItem } from "./model";

export * from "./model";

/** 진행 중이거나 가장 최근의 생성. 없으면 null. */
export const currentGenerationQuery = (testSetId: string) =>
  queryOptions({
    queryKey: getCurrentGenerationQueryKey({ path: { testSetId } }),
    queryFn: async ({ signal }): Promise<Generation | null> =>
      ((
        await sdk.getCurrentGeneration({
          path: { testSetId },
          signal,
          throwOnError: true,
        })
      ).data as Generation | null) ?? null,
  });

export interface TempUpload {
  id: string;
  expiresAt: string;
  frames: { id: string; name: string; imageCount: number }[];
}

/** 플러그인에서 올린 프레임 묶음. 올린 사람만 볼 수 있다. */
export const tempUploadQuery = (uploadId: string) =>
  queryOptions({
    queryKey: getTempUploadQueryKey({ path: { uploadId } }),
    queryFn: async ({ signal }): Promise<TempUpload> =>
      (
        await sdk.getTempUpload({
          path: { uploadId },
          signal,
          throwOnError: true,
        })
      ).data,
    retry: false,
  });

export const reviewItemsQuery = (testSetId: string) =>
  queryOptions({
    queryKey: listReviewItemsQueryKey({ path: { testSetId } }),
    queryFn: async ({ signal }): Promise<ReviewItem[]> =>
      (
        await sdk.listReviewItems({
          path: { testSetId },
          signal,
          throwOnError: true,
        })
      ).data.items as ReviewItem[],
  });
