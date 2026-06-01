/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TLS-fingerprint HTTP client — thin wrapper around @ossiana/node-libcurl.
 *
 * libcurl-impersonate + BoringSSL gives an automatic Chrome JA3 + Akamai HTTP/2
 * fingerprint, which is required to pass chatgpt.com's Cloudflare bot challenge.
 * A plain Node `fetch` is challenged (403 cf-mitigated); this client is not.
 *
 * The native addon is an untyped CJS module, so `any` is confined to this file.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let _requests: any = null;
function getRequests(): any {
  if (!_requests) {
    _requests = (require("@ossiana/node-libcurl") as { requests: unknown }).requests;
  }
  return _requests;
}

export interface HttpResponse {
  status: number;
  text: string;
}

/** A libcurl-impersonate session (auto Chrome JA3/Akamai, HTTP/2, own cookie jar). */
export class ImpersonatedSession {
  private session: any;

  constructor(timeoutSeconds = 600) {
    this.session = getRequests().session({
      ja3: "auto",
      akamai: "auto",
      httpVersion: "http2",
      redirect: false,
      timeout: timeoutSeconds,
    });
  }

  async post(
    url: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<HttpResponse> {
    const r = await this.session.post(url, { headers, data: body });
    return {
      status: (r.status ?? r.responseStatus ?? 0) as number,
      text: (r.text ?? r.responseText ?? "") as string,
    };
  }

  async get(url: string, headers: Record<string, string>): Promise<HttpResponse> {
    const r = await this.session.get(url, { headers });
    return {
      status: (r.status ?? r.responseStatus ?? 0) as number,
      text: (r.text ?? r.responseText ?? "") as string,
    };
  }

  close(): void {
    try {
      this.session?.close();
    } catch {
      /* ignore */
    }
  }
}
