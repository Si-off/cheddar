import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";
@Module({
  imports: [AuthorizationModule],
  providers: [AccountsService],
  controllers: [AccountsController],
  exports: [AccountsService],
})
export class AccountsModule {}
