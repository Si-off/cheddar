import { env } from "../config/env";
import { client } from "./generated/client.gen";

export function configureApiClient() {
  client.setConfig({ baseUrl: env.apiBaseUrl });
}
