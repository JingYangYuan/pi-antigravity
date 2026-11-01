import strictAssert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hasProxyConfiguration, postJsonDirect } from "../src/utils/http.js";

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): void {
  if (!condition) fail(`FAILED: ${message}`);
}

type Captured = { method?: string; body: string; headers: IncomingMessage["headers"] };

/**
 * Spin a local server so the test exercises the real socket path without
 * reaching Google. `respond` decides the payload for each request.
 */
async function withServer(
  respond: (res: ServerResponse) => void,
  run: (baseUrl: string, captured: Captured[]) => Promise<void>,
): Promise<void> {
  const captured: Captured[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      captured.push({ method: req.method, body, headers: req.headers });
      respond(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`, captured);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function main() {
  // 1. The payload reaches the socket byte-for-byte, with a matching Content-Length.
  const payload = JSON.stringify({ request: { contents: [{ role: "user" }] }, token: "abc" });
  await withServer(
    (res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"response":{"candidates":[]}}');
    },
    async (baseUrl, captured) => {
      const response = await postJsonDirect(`${baseUrl}/v1internal:generateContent`, {
        headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
        body: payload,
      });
      assert(response.ok, "2xx surfaces as ok");
      assert(
        (await response.text()) === '{"response":{"candidates":[]}}',
        "body is forwarded unchanged",
      );
      assert(captured.length === 1, "exactly one request sent");
      assert(captured[0]?.method === "POST", "uses POST");
      assert(captured[0]?.body === payload, "payload is not rewritten by the transport");
      assert(
        captured[0]?.headers["content-length"] === String(Buffer.byteLength(payload)),
        "content-length matches the payload",
      );
      assert(
        captured[0]?.headers.authorization === "Bearer test",
        "authorization header preserved",
      );
    },
  );

  // 2. A non-2xx answer must not masquerade as success.
  await withServer(
    (res) => {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end('{"error":{"code":400}}');
    },
    async (baseUrl) => {
      const response = await postJsonDirect(`${baseUrl}/v1internal:generateContent`, {
        body: "{}",
      });
      assert(!response.ok, "4xx does not surface as ok");
    },
  );

  // 3. Proxy detection drives whether the fallback transport is used at all.
  const proxyVars = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"];
  const saved = Object.fromEntries(proxyVars.map((name) => [name, process.env[name]]));
  try {
    for (const name of proxyVars) delete process.env[name];
    assert(!hasProxyConfiguration(), "no proxy env means direct fallback is allowed");
    process.env.HTTP_PROXY = "http://127.0.0.1:7890";
    assert(hasProxyConfiguration(), "HTTP_PROXY is detected");
    delete process.env.HTTP_PROXY;
    process.env.all_proxy = "socks5://127.0.0.1:7891";
    assert(hasProxyConfiguration(), "lowercase all_proxy is detected");
  } finally {
    for (const name of proxyVars) {
      const value = saved[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  await strictAssert.doesNotReject(async () => undefined);
  console.log("test-direct-transport: ok");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
