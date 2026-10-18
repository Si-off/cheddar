import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { RequirePermission } from "../authorization/guards";
import {
  CreateRoleDto,
  NameDto,
  RoleDto,
  UpdateRoleDto,
} from "../contracts/identity.dto";
import { RolesService } from "./roles.service";
@ApiTags("역할")
@ApiCookieAuth()
@RequirePermission("role.manage")
@Controller("api/v1/roles")
export class RolesController {
  constructor(@Inject(RolesService) private readonly service: RolesService) {}
  @Get()
  // 계정을 만들고 고칠 때 역할과 소속을 골라야 하므로 계정 관리 권한으로도 읽을 수 있다
  @RequirePermission(["role.manage", "account.manage"])
  @ApiOperation({ operationId: "listRoles", summary: "역할 목록" })
  @ApiOkResponse({ type: RoleDto, isArray: true })
  list() {
    return this.service.list();
  }
  @Post()
  @ApiOperation({ operationId: "createRole", summary: "역할 만들기" })
  @ApiCreatedResponse({ type: RoleDto })
  @ApiBody({ type: CreateRoleDto })
  create(@Body() dto: CreateRoleDto) {
    return this.service.create(dto);
  }
  @Get(":roleId")
  // 계정을 만들고 고칠 때 역할과 소속을 골라야 하므로 계정 관리 권한으로도 읽을 수 있다
  @RequirePermission(["role.manage", "account.manage"])
  @ApiOperation({ operationId: "getRole", summary: "역할 상세" })
  @ApiOkResponse({ type: RoleDto })
  detail(@Param("roleId", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }
  @Patch(":roleId")
  @ApiOperation({ operationId: "updateRole", summary: "역할과 권한 수정" })
  @ApiOkResponse({ type: RoleDto })
  @ApiBody({ type: UpdateRoleDto })
  update(
    @Param("roleId", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(":roleId")
  @HttpCode(204)
  @ApiOperation({ operationId: "deleteRole", summary: "할당이 없는 역할 삭제" })
  @ApiNoContentResponse()
  remove(@Param("roleId", ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
  @Post(":roleId/duplicate")
  @ApiOperation({ operationId: "duplicateRole", summary: "일반 역할로 복제" })
  @ApiCreatedResponse({ type: RoleDto })
  @ApiBody({ type: NameDto })
  duplicate(@Param("roleId", ParseUUIDPipe) id: string, @Body() dto: NameDto) {
    return this.service.duplicate(id, dto.name);
  }
}
