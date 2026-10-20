import type { Request } from "express";

// 메서드까지 제한한다. 예: 업로드 조회와 브라우저 승인에는 null Origin을 열지 않는다.
export function isPluginCorsRequest(request: Request) {
  const method =
    request.method === "OPTIONS"
      ? request.headers["access-control-request-method"]?.toUpperCase()
      : request.method;
  const path = request.path.replace(/\/$/, "").toLowerCase();
  return (
    (method === "GET" &&
      ["/api/v1/auth/me", "/api/v1/projects"].includes(path)) ||
    (method === "POST" &&
      [
        "/api/v1/temp-uploads",
        "/api/v1/plugin-connections",
        "/api/v1/plugin-connections/token",
      ].includes(path)) ||
    (method === "DELETE" && path === "/api/v1/plugin-connections/current")
  );
}
