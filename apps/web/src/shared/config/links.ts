/** 다른 사람에게 전달하는 링크. 경로는 app/router.tsx의 공개 경로와 같다. */
export const appLinks = {
  sharedTestSet: (token: string) =>
    `${window.location.origin}/s/${encodeURIComponent(token)}`,
};
