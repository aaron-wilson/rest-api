export interface Principal {
  id: string;
}
export interface AuthPort {
  authenticate(header: string | undefined): Promise<Principal>;
}
export class Unauthorized extends Error {}
