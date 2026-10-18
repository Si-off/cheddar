/** 다른 사람에게 전달하는 링크. 경로는 app/router.tsx의 공개 경로와 같다. */
export const appLinks = {
  invite: (token: string) =>
    `${window.location.origin}/invite?token=${encodeURIComponent(token)}`,
  passwordReset: (token: string) =>
    `${window.location.origin}/password-reset?token=${encodeURIComponent(token)}`,
};
