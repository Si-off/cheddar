import { queryOptions } from "@tanstack/react-query";
import {
  getProjectMemoQueryKey,
  getProjectQueryKey,
  getProjectTemplateQueryKey,
  getRecentTestSetTemplateQueryKey,
  listProjectFeatureGroupsQueryKey,
  listProjectScreenIdRulesQueryKey,
  listProjectScreensQueryKey,
  listProjectsQueryKey,
  sdk,
} from "@/shared/api";
import type {
  FeatureGroup,
  Memo,
  Project,
  ProjectSummary,
  Screen,
  ScreenIdRule,
  Template,
} from "./model";

export * from "./column-draft";
export * from "./column-form";
export * from "./model";

export const projectsQuery = () =>
  queryOptions({
    queryKey: listProjectsQueryKey(),
    queryFn: async ({ signal }): Promise<ProjectSummary[]> =>
      (await sdk.listProjects({ signal, throwOnError: true })).data.items,
  });

export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: getProjectQueryKey({ path: { projectId } }),
    queryFn: async ({ signal }): Promise<Project> =>
      (
        await sdk.getProject({
          path: { projectId },
          signal,
          throwOnError: true,
        })
      ).data,
  });

export const templateQuery = (projectId: string) =>
  queryOptions({
    queryKey: getProjectTemplateQueryKey({ path: { projectId } }),
    queryFn: async ({ signal }): Promise<Template> =>
      (
        await sdk.getProjectTemplate({
          path: { projectId },
          signal,
          throwOnError: true,
        })
      ).data,
  });

export const featureGroupsQuery = (projectId: string) =>
  queryOptions({
    queryKey: listProjectFeatureGroupsQueryKey({ path: { projectId } }),
    queryFn: async ({ signal }): Promise<FeatureGroup[]> =>
      (
        await sdk.listProjectFeatureGroups({
          path: { projectId },
          signal,
          throwOnError: true,
        })
      ).data.items,
  });

export const screensQuery = (projectId: string) =>
  queryOptions({
    queryKey: listProjectScreensQueryKey({ path: { projectId } }),
    queryFn: async ({ signal }): Promise<Screen[]> =>
      (
        await sdk.listProjectScreens({
          path: { projectId },
          signal,
          throwOnError: true,
        })
      ).data.items,
  });

/** 만들기의 "최근 테스트 세트와 같게"가 실제로 쓸 열. 최근 세트가 없으면 프로젝트 양식의 켜진 열이다. */
export const recentTemplateQuery = (projectId: string) =>
  queryOptions({
    queryKey: getRecentTestSetTemplateQueryKey({ path: { projectId } }),
    queryFn: async ({ signal }) =>
      (
        await sdk.getRecentTestSetTemplate({
          path: { projectId },
          signal,
          throwOnError: true,
        })
      ).data,
  });

export const screenIdRulesQuery = (projectId: string) =>
  queryOptions({
    queryKey: listProjectScreenIdRulesQueryKey({ path: { projectId } }),
    queryFn: async ({ signal }): Promise<ScreenIdRule[]> =>
      (
        await sdk.listProjectScreenIdRules({
          path: { projectId },
          signal,
          throwOnError: true,
        })
      ).data.items,
  });

export const memoQuery = (projectId: string) =>
  queryOptions({
    queryKey: getProjectMemoQueryKey({ path: { projectId } }),
    queryFn: async ({ signal }): Promise<Memo> =>
      (
        await sdk.getProjectMemo({
          path: { projectId },
          signal,
          throwOnError: true,
        })
      ).data,
  });
