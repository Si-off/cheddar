import type {
  CaseDto,
  CellValue,
  TestSetColumnDto,
} from "../contracts/test-set.dto";
import type { AiTask, Stage } from "./model-config";
export type Draft = Record<string, CellValue>;
export type GenerationInput = {
  columns: TestSetColumnDto[];
  memo: string;
  frames: {
    id: string;
    name: string;
    screenDocument: string;
    imageStorageKeys: string[];
  }[];
  featureGroups: { id: string; name: string; description: string }[];
  viewpoints: { id: string; name: string; when: string }[];
  fillColumn?: TestSetColumnDto;
  screenStructure: unknown[];
  styleExamples: CaseDto[];
  existingCases: CaseDto[];
  review?: {
    screenDescription: string;
    question: string | null;
    answer: string;
    draft: Draft;
  };
};
export type CaseOutput = {
  cases: Draft[];
  /** 최종 점검의 결과 순서와 대응한다. 이전 작업의 저장된 출력에는 없을 수 있다. */
  caseGroupKeys?: (string | null)[];
  reviewGroupKeys?: (string | null)[];
  reviews: {
    reason: string;
    question: string | null;
    screenDescription: string;
    draft: Draft;
  }[];
  coverage: {
    viewpointId: string;
    status: "covered" | "not_applicable";
    explanation: string;
  }[];
  mergedCount: number;
};
export type ScreenOutput = {
  screens: {
    frameId: string;
    name: string;
    description: string;
    features: string[];
    uncertainties: string[];
  }[];
};
export type FlowOutput = {
  groups: {
    key: string;
    name: string;
    description: string;
    screenIds: string[];
    flows: string[];
  }[];
};
export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minimum?: number;
  description?: string;
};
export type StepDefinition = {
  key: AiTask;
  displayStage: Exclude<Stage, "rewrite"> | null;
  version: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
  retries: number;
  schema: (input: GenerationInput) => JsonSchema;
  /** 단계 실행기 밖에서 쓰는 단계의 합성 출력. AI_PROVIDER=fake에서만 쓴다. */
  fake?: (sourceData: unknown) => unknown;
};
