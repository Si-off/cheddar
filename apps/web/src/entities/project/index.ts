import { queryOptions } from "@tanstack/react-query";
import {
  getProjectMemoQueryKey,
  getProjectQueryKey,
  getProjectTemplateQueryKey,
  listProjectFeatureGroupsQueryKey,
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
  Template,
} from "./model";

export * from "./column-draft";
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
