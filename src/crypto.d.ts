export interface EncryptedResponse {
  nonce: string;
  data: string;
}
export interface ApiResult {
  id: string;
  status: number;
  body: string;
  encoding?: 'base64';
  session?: string;
  expires?: number;
  contentType?: string;
  offset?: number;
  total?: number;
  nextOffset?: number | null;
  etag?: string;
}
export function b64(bytes: ArrayBuffer | Uint8Array): string;
export function unb64(text: string): Uint8Array;
export function seal(pem: string, password: string, operation: string, body: unknown, session?: string): Promise<{
  envelope: EncryptedResponse & {key: string};
  open(reply: EncryptedResponse): Promise<ApiResult>;
}>;