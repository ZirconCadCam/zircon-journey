declare module "webpush-webcrypto" {
  export class ApplicationServerKeys {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
    toJSON(): Promise<{ publicKey: string; privateKey: string }>;
    static fromJSON(keys: { publicKey: string; privateKey: string }): Promise<ApplicationServerKeys>;
    static generate(): Promise<ApplicationServerKeys>;
  }

  export function setWebCrypto(crypto: Crypto): void;

  export function generatePushHTTPRequest(opts: {
    applicationServerKeys: ApplicationServerKeys;
    payload: string;
    target: { endpoint: string; keys: { p256dh: string; auth: string } };
    adminContact: string;
    ttl?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
  }): Promise<{ headers: Record<string, string>; body: BufferSource; endpoint: string }>;
}
