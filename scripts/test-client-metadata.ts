import assert from "node:assert/strict";
import { AGY_VERSION, buildClientMetadata, clearProjectCache, loadCodeAssist } from "../src/client/client.js";
import { getLastDiagnostics, resetDiagnosticsForTests } from "../src/diagnostics/diagnostics.js";

// ---------------------------------------------------------------- payload shape
// `google.internal.cloud.code.v1internal.ClientMetadata` declares few fields; extra
// names make /v1internal:loadCodeAssist answer 400 "Unknown name" (regression #13ae45c).
const metadataKeys = Object.keys(buildClientMetadata()).sort();
assert.deepEqual(
  metadataKeys,
  ["ideType", "ideVersion", "platform", "pluginType"],
  "metadata must contain only ClientMetadata fields",
);
for (const forbidden of ["subclientType", "os", "arch", "ideName"]) {
  assert.ok(!metadataKeys.includes(forbidden), `metadata must not send ${forbidden}`);
}
assert.equal(buildClientMetadata().ideType, "ANTIGRAVITY");
assert.equal(buildClientMetadata().ideVersion, AGY_VERSION);
assert.equal(buildClientMetadata().platform, "PLATFORM_UNSPECIFIED");
assert.equal(buildClientMetadata().pluginType, "GEMINI");

// ------------------------------------------------------- successful discovery
const originalFetch = globalThis.fetch;
const sentBodies: Array<{ url: string; metadata: Record<string, unknown> }> = [];
let fetchCount = 0;

function stubFetch(reply: (url: string) => Response): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    fetchCount += 1;
    const url = typeof input === "string" ? input : String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as { metadata?: unknown }) : {};
    sentBodies.push({ url, metadata: (body.metadata ?? {}) as Record<string, unknown> });
    return reply(url);
  }) as typeof fetch;
}

try {
  resetDiagnosticsForTests();
  clearProjectCache();
  stubFetch(
    () =>
      new Response(JSON.stringify({ cloudaicompanionProject: "proj-abc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );

  assert.equal(await loadCodeAssist("token-ok"), "proj-abc");
  assert.equal(sentBodies.length, 1, "one discovery roundtrip per uncached token");
  const firstBody = sentBodies[0]!;
  assert.match(firstBody.url, /\/v1internal:loadCodeAssist$/);
  assert.deepEqual(Object.keys(firstBody.metadata).sort(), metadataKeys);
  assert.equal(firstBody.metadata.ideVersion, AGY_VERSION);

  // Cache hit: the same token must not trigger a second discovery request.
  assert.equal(await loadCodeAssist("token-ok"), "proj-abc");
  assert.equal(fetchCount, 1, "project lookup is cached per access token");

  // --------------------------------------------- rejected payload surfaces 400
  resetDiagnosticsForTests();
  clearProjectCache();
  sentBodies.length = 0;
  fetchCount = 0;
  stubFetch(
    () =>
      new Response(
        JSON.stringify({
          error: {
            code: 400,
            message: 'Invalid JSON payload received. Unknown name "subclient_type": Cannot find field.',
            status: "INVALID_ARGUMENT",
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
  );

  assert.equal(await loadCodeAssist("token-bad"), undefined, "no project id when every endpoint rejects");
  const diagnostics = getLastDiagnostics();
  assert.match(
    String(diagnostics.error),
    /loadCodeAssist 400 .*Unknown name/,
    "backend reason must reach the diagnostics snapshot",
  );
  assert.equal(diagnostics.status, 400);

  // ---------------------------- a rejected endpoint falls through to the next
  resetDiagnosticsForTests();
  clearProjectCache();
  fetchCount = 0;
  stubFetch((url) =>
    url.includes("sandbox")
      ? new Response(JSON.stringify({ projectId: "proj-sandbox" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      : new Response(JSON.stringify({ error: { message: "nope" } }), { status: 400 }),
  );
  assert.equal(
    await loadCodeAssist("token-fallthrough"),
    "proj-sandbox",
    "discovery keeps walking endpoint candidates",
  );
  assert.equal(fetchCount, 2);
} finally {
  globalThis.fetch = originalFetch;
  clearProjectCache();
  resetDiagnosticsForTests();
}

console.log("test-client-metadata: ok");
