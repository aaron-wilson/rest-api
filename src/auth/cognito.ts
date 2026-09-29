import { CognitoJwtVerifier } from "aws-jwt-verify";
import { Unauthorized, type AuthPort } from "./port";

export function createCognitoAuth(
  userPoolId: string,
  clientId: string,
  verify?: (token: string) => Promise<{ sub?: string }>
): AuthPort {
  let verifyToken = verify;
  if (!verifyToken) {
    const verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "access" });
    verifyToken = (token) => verifier.verify(token);
  }
  return {
    async authenticate(header) {
      const token = /^Bearer ([^\s]+)$/.exec(header ?? "")?.[1];
      if (!token) throw new Unauthorized("Authentication required");
      try {
        const payload = await verifyToken(token);
        if (!payload.sub) throw new Unauthorized("Invalid token");
        return { id: payload.sub };
      } catch {
        throw new Unauthorized("Invalid token");
      }
    },
  };
}
