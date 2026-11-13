import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { applyModelAccess, antigravityModelAccess } from "../src/utils/model-access.js";

const CATALOG = [
  { id: "gemini-3.8-flash-low" },
  { id: "gemini-3.8-flash-medium" },
  { id: "gemini-3.8-flash-high" },
  { id: "gemini-4-argon-high" },
  { id: "claude-sonnet-5-5-medium" },
];

const withEnv = (vars: Record<string, string | undefined>, run: () => void): void => {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-model-access-"));

// No payload anywhere: catalog passes through unchanged (same order).
withEnv({ PI_CODING_AGENT_DIR: tempDir, PIHUB_MODEL_ACCESS: undefined }, () => {
  assert.equal(antigravityModelAccess(), null);
  assert.deepEqual(applyModelAccess(CATALOG), CATALOG);
});

// Env payload: exact ids and base-id suffix matches are kept.
withEnv(
  {
    PI_CODING_AGENT_DIR: tempDir,
    PIHUB_MODEL_ACCESS: JSON.stringify({
      antigravity: [{ id: "gemini-3.8-flash" }, { id: "claude-sonnet-5-5-medium" }],
    }),
  },
  () => {
    assert.deepEqual(applyModelAccess(CATALOG).map((model) => model.id), [
      "gemini-3.8-flash-low",
      "gemini-3.8-flash-medium",
      "gemini-3.8-flash-high",
      "claude-sonnet-5-5-medium",
    ]);
  },
);

// settings.json payload wins over the env fallback.
fs.mkdirSync(tempDir, { recursive: true });
fs.writeFileSync(
  path.join(tempDir, "settings.json"),
  JSON.stringify({ pihubModelAccess: { antigravity: [{ id: "gemini-4-argon" }] } }),
);
withEnv(
  {
    PI_CODING_AGENT_DIR: tempDir,
    PIHUB_MODEL_ACCESS: JSON.stringify({ antigravity: [{ id: "claude-sonnet-5-5-medium" }] }),
  },
  () => {
    assert.deepEqual(applyModelAccess(CATALOG).map((model) => model.id), ["gemini-4-argon-high"]);
  },
);

// An empty whitelist hides every model (provider disabled or no matches).
fs.writeFileSync(
  path.join(tempDir, "settings.json"),
  JSON.stringify({ pihubModelAccess: { antigravity: [] } }),
);
withEnv({ PI_CODING_AGENT_DIR: tempDir, PIHUB_MODEL_ACCESS: undefined }, () => {
  assert.deepEqual(applyModelAccess(CATALOG), []);
});

// A malformed payload is treated as "unrestricted" (gateway still enforces).
fs.writeFileSync(path.join(tempDir, "settings.json"), "{ broken");
withEnv({ PI_CODING_AGENT_DIR: tempDir, PIHUB_MODEL_ACCESS: undefined }, () => {
  assert.equal(antigravityModelAccess(), null);
  assert.deepEqual(applyModelAccess(CATALOG), CATALOG);
});

fs.rmSync(tempDir, { recursive: true, force: true });
console.log("test-model-access: all assertions passed");
