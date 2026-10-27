import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Put,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentAccount } from "../authorization/guards";
import { FigmaTokenStatusDto, SaveFigmaTokenDto } from "../contracts/figma.dto";
import { FigmaService } from "./figma.service";

@ApiTags("Figma 토큰")
@ApiCookieAuth()
@Controller("api/v1/figma-token")
export class FigmaController {
  constructor(@Inject(FigmaService) private readonly service: FigmaService) {}
  @Get()
  @ApiOperation({ operationId: "getFigmaToken", summary: "내 Figma 토큰 보기" })
  @ApiOkResponse({ type: FigmaTokenStatusDto })
  status(@CurrentAccount() accountId: string) {
    return this.service.status(accountId);
  }
  @Put()
  @ApiOperation({
    operationId: "saveFigmaToken",
    summary: "Figma 토큰 등록과 바꾸기",
  })
  @ApiBody({ type: SaveFigmaTokenDto })
  @ApiOkResponse({ type: FigmaTokenStatusDto })
  save(@CurrentAccount() accountId: string, @Body() dto: SaveFigmaTokenDto) {
    return this.service.save(accountId, dto.token);
  }
  @Delete()
  @HttpCode(204)
  @ApiOperation({ operationId: "deleteFigmaToken", summary: "Figma 토큰 삭제" })
  @ApiNoContentResponse()
  remove(@CurrentAccount() accountId: string) {
    return this.service.remove(accountId);
  }
}
