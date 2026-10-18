import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { AffiliationsController } from "./affiliations.controller";
import { AffiliationsService } from "./affiliations.service";
@Module({
  imports: [AuthorizationModule],
  providers: [AffiliationsService],
  controllers: [AffiliationsController],
  exports: [],
})
export class AffiliationsModule {}
