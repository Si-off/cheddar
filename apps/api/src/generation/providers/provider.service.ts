import { Inject, Injectable } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../../config/env";
import type { AiTask } from "../model-config";
import { readAiConfig } from "../model-config";
import { AnthropicProvider } from "./anthropic";
import { FakeProvider } from "./fake";
import { OpenAiProvider } from "./openai";
@Injectable()
export class ProviderService {
  readonly config;
  readonly fake = new FakeProvider();
  private readonly anthropic = new AnthropicProvider();
  private readonly openai = new OpenAiProvider();
  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.config = env.ai ?? readAiConfig({});
  }
  forStage(stage: AiTask) {
    const model = this.config.models[stage];
    return {
      model,
      provider: this.config.fake
        ? this.fake
        : model.provider === "anthropic"
          ? this.anthropic
          : this.openai,
    };
  }
}
