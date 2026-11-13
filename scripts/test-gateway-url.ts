import { strict as assert } from "node:assert";
import { assertGatewayBaseUrl, assertSafeApiBaseUrl } from "../src/utils/security.js";
import { endpointCandidates } from "../src/client/client.js";

const env = (name: string, value?: string): void => {
  delete process.env[`ANTIGRAVITY_${name}`];
  delete process.env[`NOAGY_${name}`];
  if (value !== undefined) process.env[`NOAGY_${name}`] = value;
};

// Gateway URL: http allowed, trailing slash stripped.
assert.equal(
  assertGatewayBaseUrl("http://pihub-gateway:8788/r/abc123/"),
  "http://pihub-gateway:8788/r/abc123",
);
assert.equal(assertGatewayBaseUrl("https://gw.internal"), "https://gw.internal");
assert.throws(() => assertGatewayBaseUrl("ftp://gw/r"), /must use http/);
assert.throws(() => assertGatewayBaseUrl("http://u:p@gw/r"), /credentials/);
assert.throws(() => assertGatewayBaseUrl("not a url"), /Invalid/);

// Strict BASE_URL validation unchanged.
assert.throws(() => assertSafeApiBaseUrl("http://gw.internal/r/x"), /must use https/);

// endpointCandidates: gateway env wins over everything.
env("GATEWAY_URL", "http://pihub-gateway:8788/r/deadbeef");
assert.deepEqual(endpointCandidates(), ["http://pihub-gateway:8788/r/deadbeef"]);

// Without gateway env: explicit BASE_URL, then built-in fallbacks.
env("GATEWAY_URL");
env("BASE_URL", "https://cloudcode-pa.googleapis.com/");
assert.deepEqual(endpointCandidates(), ["https://cloudcode-pa.googleapis.com"]);
env("BASE_URL");
assert.deepEqual(endpointCandidates(), [
  "https://daily-cloudcode-pa.googleapis.com",
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
]);

console.log("test-gateway-url: all assertions passed");
