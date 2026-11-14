import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractEmailFromIdToken,
  hasAgyCliCredentials,
  readAgyCliCredentials,
  syncAgyCliCredentials,
} from "../src/auth/sync.js";
import { SCOPES } from "../src/auth/oauth.js";
import { AGY_VERSION, AGY_CHANGELIST, defaultUserAgent } from "../src/client/client.js";

// 1. Scopes clean-up assertion (anti-risk / anti-ban)
assert.deepEqual(SCOPES, [
  "openid",
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
]);
assert.ok(!SCOPES.some((s) => s.includes("aicode") || s.includes("cclog") || s.includes("experiments")));

// 2. User-Agent and version telemetry check
assert.equal(AGY_VERSION, "1.5.8");
assert.equal(AGY_CHANGELIST, "1020628950");
const ua = defaultUserAgent();
assert.ok(ua.startsWith("antigravity/cli/1.5.8 "));
assert.ok(ua.includes("cl=1020628950"));
assert.ok(ua.includes("aidev_client"));
assert.ok(ua.includes("auth_method=consumer"));

// 3. extractEmailFromIdToken
const samplePayload = Buffer.from(
  JSON.stringify({ email: "test-user@example.com", aud: "mock-client" }),
).toString("base64url");
const mockIdToken = `header.${samplePayload}.signature`;
assert.equal(extractEmailFromIdToken(mockIdToken), "test-user@example.com");
assert.equal(extractEmailFromIdToken("invalid-token"), undefined);

// 4. Temporary credentials file tests
const tempDir = mkdtempSync(join(tmpdir(), "pi-antigravity-sync-test-"));
const mockCredsPath = join(tempDir, "mock_creds.json");
const mockAgentDir = join(tempDir, "agent");
process.env.PI_CODING_AGENT_DIR = mockAgentDir;

try {
  assert.equal(hasAgyCliCredentials(mockCredsPath), false);
  assert.equal(readAgyCliCredentials(mockCredsPath), undefined);

  // Write valid mock credentials
  const validCreds = {
    access_token: "mock-access-token-123",
    refresh_token: "mock-refresh-token-456",
    id_token: mockIdToken,
    expiry_date: Date.now() + 3600 * 1000,
    scope: SCOPES.join(" "),
  };
  writeFileSync(mockCredsPath, JSON.stringify(validCreds, null, 2), "utf8");

  assert.equal(hasAgyCliCredentials(mockCredsPath), true);
  const parsed = readAgyCliCredentials(mockCredsPath);
  assert.ok(parsed);
  assert.equal(parsed?.access_token, "mock-access-token-123");
  assert.equal(parsed?.refresh_token, "mock-refresh-token-456");

  // Sync credentials directly without browser interaction
  const synced = await syncAgyCliCredentials({ credsPath: mockCredsPath });
  assert.equal(synced.email, "test-user@example.com");
  assert.equal(synced.access, "mock-access-token-123");
  assert.equal(synced.refresh, "mock-refresh-token-456");
  assert.ok(synced.projectId);
} finally {
  delete process.env.PI_CODING_AGENT_DIR;
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("agy sync, scope cleanup, and wire fingerprint tests passed!");
