import { antigravityEnv } from "./util.js";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Dispatcher } from "undici";
import type * as Undici from "undici";

/**
 * Node's built-in fetch keeps an idle socket for only 4 seconds unless the server
 * advertises a longer `Keep-Alive: timeout=`. The Cloud Code Assist endpoint sends no
 * such header, and interactive coding turns are almost always more than 4 seconds
 * apart, so without a dedicated pool every message pays a fresh DNS + TCP + TLS
 * handshake. A long-lived dispatcher removes that per-turn setup cost.
 *
 * The dispatcher is scoped to this provider's requests rather than installed with
 * `setGlobalDispatcher`, so it never changes HTTP behaviour for the rest of the host
 * process or for other extensions.
 *
 * Node 22+ global `fetch` cannot take an npm `undici.Agent` (handler mismatch).
 * Those runtimes already pool connections natively, so we skip the custom Agent.
 */
const KEEP_ALIVE_TIMEOUT_MS = 60_000;
const KEEP_ALIVE_MAX_TIMEOUT_MS = 5 * 60_000;
const CONNECT_TIMEOUT_MS = 10_000;
const PREWARM_TIMEOUT_MS = 5_000;
/** Ceiling for the direct (interceptor-bypassing) transport. */
const DIRECT_REQUEST_TIMEOUT_MS = 30_000;

/** `dispatcher` is an undici extension to RequestInit that Node's fetch honours. */
type DispatcherInit = RequestInit & { dispatcher?: unknown };

let dispatcherPromise: Promise<unknown> | undefined;
let prewarmStarted = false;

/** True when the process routes outbound HTTP through a configured proxy. */
export function hasProxyConfiguration(): boolean {
  return ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"].some(
    (name) => Boolean(process.env[name]?.trim()),
  );
}

async function getDispatcher(): Promise<unknown> {
  dispatcherPromise ??= (async () => {
    // Pi configures a proxy-aware global dispatcher. Passing a private Agent here
    // would bypass it and make Antigravity requests connect directly instead.
    if (antigravityEnv("NO_KEEPALIVE") === "1" || hasProxyConfiguration()) {
      return undefined;
    }
    const nodeMajor = Number(process.versions.node?.split(".")[0]);
    if (!Number.isNaN(nodeMajor) && nodeMajor >= 22) {
      return undefined;
    }
    try {
      const { Agent } = await import("undici");
      return new Agent({
        keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
        keepAliveMaxTimeout: KEEP_ALIVE_MAX_TIMEOUT_MS,
        connections: 8,
        connect: { timeout: CONNECT_TIMEOUT_MS },
        // HTTP/2 is opt-in: the endpoint negotiates it, but moving SSE onto h2 is a
        // transport change we do not want to force on every user.
        allowH2: antigravityEnv("HTTP2") === "1",
      });
    } catch {
      // undici unavailable — fall back to Node's default fetch behaviour.
      return undefined;
    }
  })();
  return dispatcherPromise;
}

/** fetch() bound to this provider's keep-alive connection pool when available. */
export async function antigravityFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const dispatcher = await getDispatcher();
  if (!dispatcher) return fetch(input, init);
  return fetch(input, { ...init, dispatcher } as DispatcherInit);
}

/**
 * POST JSON without the host's `fetch` implementation.
 *
 * Host extensions patch `globalThis.fetch` to intercept model-API URLs and may
 * rewrite the payload before it leaves the process. billion-context does that for
 * every `/v1internal:generateContent` call (it appends its context-carrier
 * `functionDeclarations` to `tools`), and Google's built-in-tool validation then
 * rejects the rewritten request with
 *
 *   Please enable tool_config.include_server_side_tool_invocations to use
 *   Built-in tools with Function calling.
 *
 * even though our own bytes are valid (the same body sent outside the patched fetch
 * returns 200). Search retries through this transport when it sees that specific
 * rejection, so grounding keeps working behind such an interceptor.
 *
 * The fallback keeps proxy support: `undici.request` dispatches through the process
 * dispatcher (pi installs an `EnvHttpProxyAgent`, so `HTTP(S)_PROXY`, `NO_PROXY` and
 * cert-MITM proxies keep working) instead of `globalThis.fetch`, which is the only
 * thing interceptors replace. `node:https` stays as the last resort for hosts where
 * undici is unavailable; it is only reachable without a proxy because it cannot
 * traverse one.
 */
export async function postJsonDirect(
  url: string,
  init: { headers?: Record<string, string>; body: string; signal?: AbortSignal },
): Promise<Response> {
  const viaUndici = await postJsonViaUndici(url, init).catch(() => undefined);
  if (viaUndici) return viaUndici;
  if (hasProxyConfiguration()) return new Response("direct request failed", { status: 502 });
  return postJsonViaNodeHttp(url, init);
}

/**
 * Dispatcher used by the interceptor-bypassing transport.
 *
 * Resolution order: the host's curated global dispatcher (pi sets a proxy-aware
 * `EnvHttpProxyAgent` there, shared across undici copies through a `Symbol.for`
 * slot) → our own env-driven proxy agent → undici's default direct agent.
 */
let fallbackDispatcherPromise: Promise<unknown> | undefined;

async function getFallbackDispatcher(undiciModule: typeof Undici): Promise<unknown> {
  fallbackDispatcherPromise ??= (async () => {
    const globalDispatcher = undiciModule.getGlobalDispatcher();
    // A bare `Agent` means nobody configured proxying; anything else is a host choice
    // (EnvHttpProxyAgent, ProxyAgent, custom pool) worth reusing as-is.
    if (!(globalDispatcher instanceof undiciModule.Agent)) return globalDispatcher;
    if (!hasProxyConfiguration()) return globalDispatcher;
    try {
      return new undiciModule.EnvHttpProxyAgent({ allowH2: false, proxyTunnel: true });
    } catch {
      return globalDispatcher;
    }
  })();
  return fallbackDispatcherPromise;
}

async function postJsonViaUndici(
  url: string,
  init: { headers?: Record<string, string>; body: string; signal?: AbortSignal },
): Promise<Response | undefined> {
  let undiciModule: typeof Undici;
  try {
    undiciModule = await import("undici");
  } catch {
    return undefined;
  }

  const dispatcher = await getFallbackDispatcher(undiciModule);
  const response = await undiciModule.request(url, {
    method: "POST",
    headers: init.headers,
    body: init.body,
    signal: init.signal,
    dispatcher: dispatcher as Dispatcher,
    headersTimeout: DIRECT_REQUEST_TIMEOUT_MS,
    bodyTimeout: DIRECT_REQUEST_TIMEOUT_MS,
  });
  const text = await response.body.text();
  // 204/304 cannot carry a body in a Response constructor.
  return new Response(text && ![204, 304].includes(response.statusCode) ? text : null, {
    status: response.statusCode,
    headers: { "content-type": String(response.headers["content-type"] ?? "application/json") },
  });
}

async function postJsonViaNodeHttp(
  url: string,
  init: { headers?: Record<string, string>; body: string; signal?: AbortSignal },
): Promise<Response> {
  const target = new URL(url);
  const send = target.protocol === "http:" ? httpRequest : httpsRequest;

  const payload = await new Promise<string>((resolve, reject) => {
    const req = send(
      target,
      {
        method: "POST",
        headers: { ...init.headers, "Content-Length": String(Buffer.byteLength(init.body)) },
        signal: init.signal,
        timeout: DIRECT_REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          const text = Buffer.concat(chunks).toString("utf8");
          resolve(status >= 200 && status < 300 ? text : "");
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error(`Direct request timed out after ${DIRECT_REQUEST_TIMEOUT_MS}ms`)),
    );
    req.on("error", reject);
    req.end(init.body);
  });

  // Callers only inspect `ok` and parse the body, so an empty payload signals the
  // non-2xx case without re-deriving a Response from the raw socket.
  return payload
    ? new Response(payload, { status: 200 })
    : new Response("direct request failed", { status: 502 });
}

/**
 * Open the TLS connection on the first Antigravity request so that turn does not
 * pay the handshake. Not called at extension load: an unauthenticated HEAD to the
 * endpoint can stall Node's event loop until connect timeout and freeze Pi startup.
 * Best-effort: failures are ignored. Subsequent calls are no-ops.
 */
export function prewarmConnection(url: string): void {
  if (antigravityEnv("NO_PREWARM") === "1") return;
  if (prewarmStarted) return;
  prewarmStarted = true;
  void (async () => {
    try {
      const res = await antigravityFetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(PREWARM_TIMEOUT_MS),
      });
      // Release the socket back to the pool even though HEAD carries no body.
      await res.arrayBuffer();
    } catch {
      // Warm-up only; the real request will establish the connection instead.
    }
  })();
}
