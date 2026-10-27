import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ErrorResponseDto } from "../contracts/common.dto";
export function createDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("테스트 케이스 제네레이터 API")
    .setVersion("2.0.0")
    .setDescription(
      "계정, 세션 인증, 프로젝트 설정과 테스트 세트 API. 활성 계정은 모든 프로젝트와 테스트 세트를 편집하고 관리자는 계정을 관리합니다.",
    )
    .addCookieAuth("session")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto],
  });
  for (const schema of Object.values(document.components?.schemas ?? {})) {
    if (!("$ref" in schema) && schema.type === "object" && schema.properties)
      schema.additionalProperties = false;
  }
  for (const path of Object.values(document.paths)) {
    for (const verb of ["get", "post", "put", "patch", "delete"] as const) {
      const operation = path[verb];
      if (!operation) continue;
      for (const status of [400, 401, 403, 404, 409, 410, 500, 503]) {
        operation.responses[String(status)] ??= {
          description:
            {
              400: "입력 오류",
              401: "인증 필요",
              403: "접근 권한 또는 Origin 거부",
              404: "항목 없음",
              409: "업무 규칙 위반 또는 중복",
              410: "사용할 수 없는 토큰",
              500: "서버 오류",
              503: "의존 서비스 오류",
            }[status] ?? "오류",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponseDto" },
            },
          },
        };
      }
    }
  }
  return document;
}
