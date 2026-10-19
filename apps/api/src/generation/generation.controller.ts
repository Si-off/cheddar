import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentAccount } from "../authorization/guards";
import {
  CreateGenerationDto,
  GenerationAcceptedDto,
  GenerationCurrentDto,
} from "../contracts/generation.dto";
import { GenerationService } from "./generation.service";
import { formatEvent, heartbeat, jobEvent } from "./sse";
@ApiTags("AI 생성")
@ApiCookieAuth()
@ApiExtraModels(GenerationCurrentDto)
@Controller("api/v1")
export class GenerationController {
  constructor(
    @Inject(GenerationService) private readonly service: GenerationService,
  ) {}
  @Post("test-sets/:testSetId/generations")
  @HttpCode(202)
  @ApiOperation({
    operationId: "createGeneration",
    summary: "케이스 생성 시작",
  })
  @ApiBody({ type: CreateGenerationDto })
  @ApiAcceptedResponse({ type: GenerationAcceptedDto })
  create(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: CreateGenerationDto,
  ) {
    return this.service.create(id, accountId, dto);
  }
  @Get("test-sets/:testSetId/generations/current")
  @ApiOperation({
    operationId: "getCurrentGeneration",
    summary: "최근 생성 작업 보기",
  })
  @ApiOkResponse({
    schema: {
      allOf: [{ $ref: getSchemaPath(GenerationCurrentDto) }],
      nullable: true,
    },
  })
  current(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.current(id, accountId);
  }
  @Get("generations/:jobId/events")
  @ApiOperation({
    operationId: "getGenerationEvents",
    summary: "생성 단계 진행 받기",
  })
  @ApiProduces("text/event-stream")
  @ApiOkResponse({
    content: {
      "text/event-stream": {
        schema: {
          type: "string",
          description: "progress, done 이벤트와 15초 간격 연결 유지 주석",
        },
      },
    },
  })
  async events(
    @Param("jobId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Res() response: Response,
  ) {
    const initial = await this.service.visibleJob(id, accountId);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    let last = jobEvent(initial);
    const order = ["screens", "flows", "cases", "finish"];
    let lastStage =
      initial.status === "running" ? order.indexOf(initial.stage ?? "") : -1;
    response.write(last);
    if (["succeeded", "failed"].includes(initial.status)) {
      response.end();
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const keepAlive = setInterval(() => {
      response.write(heartbeat);
    }, 15000);
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(keepAlive);
    };
    response.on("close", stop);
    const poll = async () => {
      try {
        const job = await this.service.visibleJob(id, accountId);
        if (stopped) return;
        // 짧은 단계가 폴링 사이에 끝나도 저장된 단계 기록으로 순서대로 전한다.
        if (job.kind !== "rewrite") {
          for (const stage of await this.service.startedStages(id)) {
            const index = order.indexOf(stage);
            if (index > lastStage) {
              last = formatEvent("progress", { stage, status: "running" });
              response.write(last);
              lastStage = index;
            }
          }
        }
        const event = jobEvent(job);
        if (last !== event) {
          response.write(event);
          last = event;
        }
        if (["succeeded", "failed"].includes(job.status)) {
          stop();
          response.end();
          return;
        }
        timer = setTimeout(poll, 250);
      } catch {
        stop();
        response.end();
      }
    };
    timer = setTimeout(poll, 250);
  }
}
