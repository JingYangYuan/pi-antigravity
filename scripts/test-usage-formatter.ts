import assert from "node:assert/strict";
import { formatUsageSummary } from "../src/usage/usage.js";

console.log("Running usage formatter tests...");

const baseUsage = {
  projectId: "test",
  endpoint: "test",
  groups: [],
  models: [],
  fetchedAt: Date.now(),
};

// Regression fixture for #3501 error message
const message3501 =
  "/v1internal:retrieveUserQuotaSummary failed: You are currently configured to use a Google Cloud Project but lack a Gemini Code Assist license. Please contact your administrator to request a license. (#3501)";

const out = formatUsageSummary({
  ...baseUsage,
  quotaSummaryError: message3501,
});

assert.ok(
  out.includes("needs a paid subscription") || out.includes("free-tier can't use that endpoint"),
);

const argonUsage = {
  ...baseUsage,
  groups: [
    {
      groupName: "Gemini 4 Argon",
      buckets: [
        {
          bucketId: "gemini-argon-wtu-weekly",
          displayName: "Gemini 4 Argon Weekly Limit",
          window: "weekly",
          remainingFraction: 0.88,
          resetTime: "2026-10-23T00:00:00Z",
        },
      ],
    },
  ],
  models: [
    {
      id: "gemini-4-argon-low",
      displayName: "Gemini 4 Argon (Low)",
      quotaFraction: 0.88,
      resetTime: "2026-10-23T00:00:00Z",
      supportsImages: true,
      supportsThinking: true,
      contextWindow: 1048576,
      maxTokens: 65536,
    },
  ],
};
const argonOut = formatUsageSummary(argonUsage);
assert.ok(argonOut.includes("Gemini 4 Argon"));
assert.ok(argonOut.includes("88%"));

console.log("Usage formatter tests passed!");
