import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentAccount } from "../authorization/guards";
import { ErrorResponseDto } from "../contracts/common.dto";
import {
  AcceptReviewItemDto,
  AcceptReviewResultDto,
  GenerationAcceptedDto,
  PatchReviewItemDto,
  ReviewItemDto,
  ReviewItemsDto,
  RewriteReviewItemDto,
} from "../contracts/generation.dto";
import { ReviewItemsService } from "./review-items.service";
@ApiTags("확인 필요")
@ApiCookieAuth()
@Controller("api/v1")
export class ReviewItemsController {
  constructor(
    @Inject(ReviewItemsService) private readonly service: ReviewItemsService,
  ) {}
  @Get("test-sets/:testSetId/review-items")
  @ApiOperation({ operationId: "listReviewItems", summary: "확인 필요 목록" })
  @ApiOkResponse({ type: ReviewItemsDto })
  list(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.list(id, accountId);
  }
  @Patch("review-items/:itemId")
  @ApiOperation({
    operationId: "updateReviewItem",
    summary: "확인 필요 수정과 제외",
  })
  @ApiBody({ type: PatchReviewItemDto })
  @ApiOkResponse({ type: ReviewItemDto })
  patch(
    @Param("itemId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: PatchReviewItemDto,
  ) {
    return this.service.patch(id, accountId, dto);
  }
  @Post("review-items/:itemId/accept")
  @HttpCode(200)
  @ApiOperation({
    operationId: "acceptReviewItem",
    summary: "확인 필요를 케이스로 추가",
  })
  @ApiBody({ type: AcceptReviewItemDto })
  @ApiOkResponse({ type: AcceptReviewResultDto })
  accept(
    @Param("itemId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: AcceptReviewItemDto,
  ) {
    return this.service.accept(id, accountId, dto);
  }
  @Post("review-items/:itemId/rewrite")
  @HttpCode(202)
  @ApiOperation({
    operationId: "rewriteReviewItem",
    summary: "답변으로 다시 작성",
  })
  @ApiBody({ type: RewriteReviewItemDto })
  @ApiAcceptedResponse({ type: GenerationAcceptedDto })
  @ApiResponse({
    status: 429,
    description: "동시 생성 한도 초과",
    type: ErrorResponseDto,
  })
  rewrite(
    @Param("itemId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: RewriteReviewItemDto,
  ) {
    return this.service.rewrite(id, accountId, dto);
  }
}
