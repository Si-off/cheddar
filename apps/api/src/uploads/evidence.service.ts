import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { ApiError, invalid, notFound } from "../common/errors";
import type { EvidenceDto, EvidenceLinkDto } from "../contracts/evidence.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import {
  projectEvidence,
  projects,
  testCases,
  uploadFrames,
} from "../database/schema";
import { FilesService } from "../files/files.service";
import { extractEvidence } from "./extract-evidence";
import { UploadsService } from "./uploads.service";

export async function appendEvidenceLinks(
  tx: DatabaseTransaction,
  projectId: string,
  links: EvidenceLinkDto[],
  replaceSheet?: string,
) {
  const [doc] = await tx
    .select()
    .from(projectEvidence)
    .where(eq(projectEvidence.projectId, projectId));
  if (!doc) return;
  const allowed = new Set(
    doc.items
      .filter((i) => i.kind === "requirement" || i.kind === "question")
      .map((i) => i.id),
  );
  if (links.some((l) => !allowed.has(l.requirementId)))
    throw invalid([{ field: "requirementIds", code: "unknownRequirement" }]);
  const combined = [
    ...doc.links.filter((l) => l.sheetId !== replaceSheet),
    ...links,
  ];
  const unique = [
    ...new Map(
      combined.map((l) => [`${l.requirementId}/${l.sheetId}/${l.caseId}`, l]),
    ).values(),
  ];
  await tx
    .update(projectEvidence)
    .set({ links: unique, revision: doc.revision + 1 })
    .where(eq(projectEvidence.projectId, projectId));
}
@Injectable()
export class EvidenceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}
  async get(projectId: string): Promise<EvidenceDto> {
    const [project] = await this.database.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw notFound();
    const [doc] = await this.database.db
      .select()
      .from(projectEvidence)
      .where(eq(projectEvidence.projectId, projectId));
    if (!doc) return { revision: 0, items: [], links: [] };
    const cases = await this.database.db
      .select({ id: testCases.id, sheetId: testCases.sheetId })
      .from(testCases)
      .where(eq(testCases.projectId, projectId));
    return {
      revision: doc.revision,
      items: doc.items,
      links: doc.links.filter((l) =>
        cases.some((c) => c.id === l.caseId && c.sheetId === l.sheetId),
      ),
    };
  }
  async save(projectId: string, input: EvidenceDto): Promise<EvidenceDto> {
    return this.database.db.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      if (!project) throw notFound();
      const [doc] = await tx
        .select()
        .from(projectEvidence)
        .where(eq(projectEvidence.projectId, projectId));
      if ((doc?.revision ?? 0) !== input.revision)
        throw new ApiError(
          409,
          "EVIDENCE_CONFLICT",
          "다른 곳에서 자료를 변경했습니다. 입력을 복사한 뒤 최신 자료를 불러와주세요.",
        );
      const ids = new Set(input.items.map((i) => i.id));
      const frames = [
        ...new Set(input.items.flatMap((i) => (i.frameId ? [i.frameId] : []))),
      ];
      const found = frames.length
        ? await tx
            .select({ id: uploadFrames.id })
            .from(uploadFrames)
            .where(
              and(
                eq(uploadFrames.projectId, projectId),
                inArray(uploadFrames.id, frames),
              ),
            )
        : [];
      if (found.length !== frames.length)
        throw invalid([{ field: "frameId", code: "projectMismatch" }]);
      for (const item of input.items) {
        if (
          [item.parentId, item.fromId, item.toId].some(
            (id) => id !== undefined && (!ids.has(id) || id === item.id),
          )
        )
          throw invalid([{ field: "items", code: "unknownReference" }]);
        if (
          item.region &&
          (!item.frameId ||
            item.region.x + item.region.width > 1.000001 ||
            item.region.y + item.region.height > 1.000001)
        )
          throw invalid([{ field: "region", code: "outsideFrame" }]);
        let parent = item.parentId;
        const seen = new Set([item.id]);
        while (parent) {
          if (seen.has(parent))
            throw invalid([{ field: "parentId", code: "cycle" }]);
          seen.add(parent);
          parent = input.items.find((i) => i.id === parent)?.parentId;
        }
        if (
          item.kind === "relation" &&
          (!item.relation || !item.fromId || !item.toId)
        )
          throw invalid([{ field: "relation", code: "incomplete" }]);
      }
      const cases = input.links.length
        ? await tx
            .select({ id: testCases.id, sheetId: testCases.sheetId })
            .from(testCases)
            .where(eq(testCases.projectId, projectId))
        : [];
      if (
        input.links.some(
          (l) =>
            !input.items.some(
              (i) =>
                i.id === l.requirementId &&
                (i.kind === "requirement" || i.kind === "question"),
            ) ||
            !cases.some((c) => c.id === l.caseId && c.sheetId === l.sheetId),
        )
      )
        throw invalid([{ field: "links", code: "unknownReference" }]);
      const next = {
        revision: input.revision + 1,
        items: input.items,
        links: input.links,
      };
      await tx
        .insert(projectEvidence)
        .values({ projectId, ...next })
        .onConflictDoUpdate({ target: projectEvidence.projectId, set: next });
      return next;
    });
  }
  async extract(projectId: string, uploadId: string) {
    const upload = await this.uploads.get(projectId, uploadId);
    const items: EvidenceDto["items"] = [];
    let bytes = 0;
    for (const frame of upload.frames) {
      const file = await this.files.download(projectId, frame.dataFileId);
      const parts: Buffer[] = [];
      for await (const part of file.stream) {
        bytes += part.length;
        if (bytes > 20 * 1024 * 1024)
          throw new ApiError(
            413,
            "SOURCE_TOO_LARGE",
            "자료 크기가 분석 한도를 넘었습니다. 업로드 범위를 줄여주세요.",
          );
        parts.push(Buffer.from(part));
      }
      try {
        items.push(
          ...extractEvidence(
            JSON.parse(Buffer.concat(parts).toString("utf8")),
            frame.id,
          ),
        );
      } catch {
        throw new ApiError(
          422,
          "SOURCE_UNSUPPORTED",
          "자료 구조를 분석하지 못했습니다. 원본을 확인하거나 직접 항목을 추가해주세요.",
        );
      }
      if (items.length > 10000)
        throw new ApiError(
          413,
          "SOURCE_TOO_LARGE",
          "분석 항목이 너무 많습니다. 업로드 범위를 줄여주세요.",
        );
    }
    return { revision: 0, items, links: [] };
  }
}
