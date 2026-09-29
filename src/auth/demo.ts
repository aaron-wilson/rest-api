import { Unauthorized, type AuthPort } from "./port";

export const demoAuth: AuthPort = {
  async authenticate(header) {
    if (header !== "Bearer demo") throw new Unauthorized("Authentication required");
    return { id: "demo" };
  },
};
