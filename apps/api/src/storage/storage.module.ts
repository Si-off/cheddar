import { Module } from "@nestjs/common";
import { LocalStorage } from "./local-storage";
@Module({ providers: [LocalStorage], exports: [LocalStorage] })
export class StorageModule {}
