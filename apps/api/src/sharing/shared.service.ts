import type { IncomingMessage } from "node:http";
import { Inject, Injectable } from "@nestjs/common";
import type { Response } from "express";
import { AuthService, SESSION_COOKIE } from "../auth/auth.service";
import { newToken } from "../auth/credentials";
import { ApiError } from "../common/errors";
import { API_ENV, type ApiEnv } from "../config/env";
import { TestSetsService } from "../test-sets/test-sets.service";
import {
  linkNotFound,
  type SharedSubject,
  TestSetsStore,
} from "../test-sets/test-sets.store";

export const VISITOR_COOKIE = "cheddar_visitor";
export function cookie(request: IncomingMessage, name: string) {
  return request.headers.cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
@Injectable()
export class SharedService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(TestSetsStore) readonly store: TestSetsStore,
    @Inject(TestSetsService) readonly sets: TestSetsService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}
  async subject(
    linkToken: string,
    request: IncomingMessage,
    response?: Response,
  ): Promise<SharedSubject> {
    try {
      const accountId = await this.auth.authenticate(
        cookie(request, SESSION_COOKIE),
      );
      return { linkToken, accountId };
    } catch (error) {
      if (!(error instanceof ApiError) || error.getStatus() !== 401)
        throw error;
    }
    let visitorToken = cookie(request, VISITOR_COOKIE);
    if (!visitorToken || !/^[A-Za-z0-9_-]{43}$/.test(visitorToken)) {
      if (!response) throw linkNotFound();
      visitorToken = newToken();
      response.cookie(VISITOR_COOKIE, visitorToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: this.env.production ?? false,
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
    }
    return { linkToken, visitorToken };
  }
  async detail(subject: SharedSubject) {
    return this.store.database.db.transaction(async (tx) => {
      const resolved = await this.store.shared(subject, tx, true);
      const detail = await this.sets.detail(resolved.row.id, subject, tx);
      return {
        ...detail,
        owner: { name: detail.owner.name },
        me: resolved.actor,
      };
    });
  }
  async prepare(subject: SharedSubject) {
    return this.store.database.db.transaction((tx) =>
      this.store.shared(subject, tx, true),
    );
  }
}
