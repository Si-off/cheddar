import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentAccount } from "../authorization/guards";
import { PatchSharingDto, SharingDto } from "../contracts/sharing.dto";
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
}
