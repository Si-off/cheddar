import type { TemplateColumnDto } from "../contracts/project.dto";
import type { CaseDto, CellValue } from "../contracts/test-set.dto";
import type { Stage } from "./model-config";
export type Draft = Record<string, CellValue>;
export type GenerationInput = {
  columns: TemplateColumnDto[];
  memo: string;
  frames: {
    id: string;
    name: string;
    screenDocument: string;
    imageStorageKeys: string[];
  }[];
  featureGroups: { id: string; name: string; description: string }[];
  requiredCases: { id: string; description: string }[];
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
  reviews: {
    reason: string;
    question: string | null;
    screenDescription: string;
    draft: Draft;
  }[];
  coverage: {
    requiredCaseId: string;
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
  key: Stage;
  displayStage: Exclude<Stage, "rewrite"> | null;
  version: string;
  prompt: string;
  effort: "low" | "high";
  maxTokens: number;
  timeoutMs: number;
  retries: number;
  schema: (input: GenerationInput) => JsonSchema;
};
