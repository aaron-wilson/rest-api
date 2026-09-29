import type { parseEnv } from "../config/env";
import { createCognitoAuth } from "./cognito";
import { demoAuth } from "./demo";

export function selectAuth(config: ReturnType<typeof parseEnv>) {
  if (config.appMode === "demo") return demoAuth;
  if (!config.cognitoUserPoolId || !config.cognitoClientId)
    throw new Error("Cognito settings required");
  return createCognitoAuth(config.cognitoUserPoolId, config.cognitoClientId);
}
