import { Module } from "@nestjs/common";
import { IaController } from "./ia.controller";
import { IaRepository } from "./ia.repository";
import { IaService } from "./ia.service";

@Module({ controllers: [IaController], providers: [IaRepository, IaService] })
export class IaModule {}
