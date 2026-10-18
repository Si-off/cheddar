import { queryOptions } from "@tanstack/react-query";
import { listAffiliationsQueryKey, sdk } from "@/shared/api";

export interface Affiliation {
  id: string;
  name: string;
}

export const affiliationsQuery = () =>
  queryOptions({
    queryKey: listAffiliationsQueryKey(),
    queryFn: async ({ signal }): Promise<Affiliation[]> =>
      (await sdk.listAffiliations({ signal, throwOnError: true })).data.map(
        (a) => ({ id: a.id, name: a.name }),
      ),
  });
