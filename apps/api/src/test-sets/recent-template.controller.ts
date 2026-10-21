import { Controller, Get, Inject, Param, ParseUUIDPipe } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentAccount } from "../authorization/guards";
import { RecentTemplateDto } from "../contracts/test-set.dto";
import { TestSetsService } from "./test-sets.service";

@ApiTags("프로젝트 설정")
@ApiCookieAuth()
@Controller("api/v1/projects")
export class RecentTemplateController {
  constructor(
    @Inject(TestSetsService) private readonly service: TestSetsService,
  ) {}

  @Get(":projectId/recent-test-set-template")
  @ApiOperation({
    operationId: "getRecentTestSetTemplate",
    summary: "최근 테스트 세트 양식 미리보기",
  })
  @ApiOkResponse({ type: RecentTemplateDto })
  recentTemplate(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.recentTemplate(projectId, accountId);
  }
}
