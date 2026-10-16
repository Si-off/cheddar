import { Inject, Injectable } from "@nestjs/common";
import type { TestScenarioExportQueryDto } from "../contracts/test-scenarios.dto";
import {
  revisionConflict,
  TestScenariosRepository,
} from "../test-scenarios/test-scenarios.repository";
import { createXlsx, downloadName } from "./xlsx";

@Injectable()
export class ExportsService {
  constructor(
    @Inject(TestScenariosRepository)
    private readonly testScenarios: TestScenariosRepository,
  ) {}
  async export(
    projectId: string,
    testScenarioId: string,
    query: TestScenarioExportQueryDto,
  ) {
    const snapshot = await this.testScenarios.get(
      projectId.toLowerCase(),
      testScenarioId.toLowerCase(),
    );
    if (
      query.contentRevision !== undefined &&
      query.contentRevision !== snapshot.contentRevision
    )
      throw revisionConflict("content", snapshot.contentRevision);
    if (
      query.viewRevision !== undefined &&
      query.viewRevision !== snapshot.viewRevision
    )
      throw revisionConflict("view", snapshot.viewRevision);
    return {
      filename: downloadName(snapshot.name),
      bytes: await createXlsx(snapshot),
    };
  }
}
