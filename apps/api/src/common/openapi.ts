import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import {
  CreateIaItemDto,
  DeleteIaQueryDto,
  IaPageDto,
  ProjectTemplateDto,
  UpdateIaItemDto,
  UpdateTemplateDto,
} from "../contracts/ia.dto";
import {
  CreateSheetDto,
  SheetContentDto,
  SheetExportQueryDto,
  SheetPageDto,
  SheetPageQueryDto,
  SheetSnapshotDto,
  SheetViewDto,
} from "../contracts/sheets.dto";
import {
  CreateUploadDto,
  UploadDto,
  UploadPageDto,
} from "../contracts/uploads.dto";

export function createDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Cheddar API")
    .setVersion("1.0.0")
    .setDescription(
      "Local project, file, upload, IA, template, sheet and XLSX export API.",
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [
      CreateUploadDto,
      UploadDto,
      UploadPageDto,
      CreateSheetDto,
      SheetContentDto,
      SheetViewDto,
      CreateIaItemDto,
      DeleteIaQueryDto,
      IaPageDto,
      ProjectTemplateDto,
      SheetPageDto,
      SheetPageQueryDto,
      SheetSnapshotDto,
      SheetExportQueryDto,
      UpdateIaItemDto,
      UpdateTemplateDto,
    ],
  });
  // ValidationPipe rejects undeclared DTO fields; express the same rule for SDK consumers.
  for (const schema of Object.values(document.components?.schemas ?? {})) {
    if (!("$ref" in schema) && schema.type === "object" && schema.properties)
      schema.additionalProperties = false;
  }
  for (const path of Object.values(document.paths)) {
    for (const verb of ["post", "put", "patch", "delete"] as const) {
      const operation = path[verb];
      if (operation)
        operation.responses["403"] = {
          description: "Origin rejected",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponseDto" },
            },
          },
        };
    }
  }
  return document;
}
