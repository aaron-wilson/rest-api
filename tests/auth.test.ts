import { createSign, generateKeyPairSync } from "node:crypto";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { expect, it } from "vitest";
import { createCognitoAuth } from "../src/auth/cognito";
import { demoAuth } from "../src/auth/demo";
import { createApp } from "../src/app";
import { parseEnv } from "../src/config/env";

const pool = "us-east-1_TEST";
const clientId = "local-client";
const issuer = `https://cognito-idp.us-east-1.amazonaws.com/${pool}`;

it("verifies Cognito signature, issuer, client and access-token use with local keys", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const verifier = CognitoJwtVerifier.create({ userPoolId: pool, clientId, tokenUse: "access" });
  verifier.cacheJwks({ keys: [{ ...jwk, kid: "local", alg: "RS256", use: "sig" }] });
  const auth = createCognitoAuth(pool, clientId, (token) => verifier.verify(token));
  function signed(overrides: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "local" })).toString(
      "base64url"
    );
    const payload = Buffer.from(
      JSON.stringify({
        iss: issuer,
        sub: "owner-1",
        token_use: "access",
        client_id: clientId,
        iat: now,
        exp: now + 3600,
        ...overrides,
      })
    ).toString("base64url");
    const data = `${header}.${payload}`;
    const signature = createSign("RSA-SHA256")
      .update(data)
      .end()
      .sign(privateKey)
      .toString("base64url");
    return `${data}.${signature}`;
  }
  expect(await auth.authenticate(`Bearer ${signed()}`)).toEqual({ id: "owner-1" });
  for (const claims of [
    { iss: "https://wrong.example" },
    { client_id: "other" },
    { token_use: "id" },
    { exp: Math.floor(Date.now() / 1000) - 10 },
  ])
    await expect(auth.authenticate(`Bearer ${signed(claims)}`)).rejects.toThrow("Invalid token");
  await expect(auth.authenticate(`Bearer ${signed().slice(0, -5)}wrong`)).rejects.toThrow(
    "Invalid token"
  );
  await expect(auth.authenticate(undefined)).rejects.toThrow("Authentication required");
});

it("keeps demo auth out of live composition", async () => {
  expect(() => parseEnv({ APP_MODE: "live" })).toThrow("Cognito settings");
  const config = parseEnv({
    APP_MODE: "live",
    COGNITO_USER_POOL_ID: pool,
    COGNITO_CLIENT_ID: clientId,
  });
  expect(() => createApp(config, undefined, demoAuth)).toThrow("Demo auth is unavailable");
  expect(await demoAuth.authenticate("Bearer demo")).toEqual({ id: "demo" });
  await expect(demoAuth.authenticate("Bearer other")).rejects.toThrow("Authentication required");
});
