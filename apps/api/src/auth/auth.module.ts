import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
@Module({
  imports: [AuthorizationModule, AccountsModule],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
