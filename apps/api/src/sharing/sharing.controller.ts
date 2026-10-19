import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentAccount } from "../authorization/guards";
import {
  MemberAccessDto,
  PatchSharingDto,
  SharingCandidatesQueryDto,
  SharingDto,
  SharingPersonDto,
} from "../contracts/sharing.dto";
import { SharingService } from "./sharing.service";

@ApiTags("공유")
@ApiCookieAuth()
@Controller("api/v1/test-sets/:testSetId")
export class SharingController {
  constructor(
    @Inject(SharingService) private readonly service: SharingService,
  ) {}
  @Get("sharing")
  @ApiOperation({ operationId: "getTestSetSharing", summary: "공유 설정 읽기" })
  @ApiOkResponse({ type: SharingDto })
  detail(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() account: string,
  ) {
    return this.service.detail(id, account);
  }
  @Patch("sharing")
  @ApiOperation({
    operationId: "updateTestSetSharing",
    summary: "공개 범위와 링크 권한 변경",
  })
  @ApiBody({ type: PatchSharingDto })
  @ApiOkResponse({ type: SharingDto })
  patch(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() account: string,
    @Body() dto: PatchSharingDto,
  ) {
    return this.service.patch(id, account, dto);
  }
  @Post("sharing/link")
  @ApiOperation({
    operationId: "replaceTestSetLink",
    summary: "공유 링크 새로 만들기",
  })
  @ApiCreatedResponse({ type: SharingDto })
  rotate(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() account: string,
  ) {
    return this.service.rotate(id, account);
  }
  @Get("sharing/candidates")
  @ApiOperation({
    operationId: "listSharingCandidates",
    summary: "초대할 계정 찾기",
  })
  @ApiQuery({ type: SharingCandidatesQueryDto })
  @ApiOkResponse({ type: [SharingPersonDto] })
  candidates(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() account: string,
    @Query() query: SharingCandidatesQueryDto,
  ) {
    return this.service.candidates(id, account, query.search);
  }
  @Put("members/:accountId")
  @ApiOperation({
    operationId: "setTestSetMember",
    summary: "사람 초대와 권한 변경",
  })
  @ApiBody({ type: MemberAccessDto })
  @ApiOkResponse({ type: SharingDto })
  member(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() account: string,
    @Param("accountId", ParseUUIDPipe) target: string,
    @Body() dto: MemberAccessDto,
  ) {
    return this.service.member(id, account, target, dto);
  }
  @Delete("members/:accountId")
  @ApiOperation({ operationId: "removeTestSetMember", summary: "구성원 제거" })
  @ApiOkResponse({ type: SharingDto })
  remove(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() account: string,
    @Param("accountId", ParseUUIDPipe) target: string,
  ) {
    return this.service.member(id, account, target);
  }
}
