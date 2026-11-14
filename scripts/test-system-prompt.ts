import assert from "node:assert/strict";
import {
  ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION,
  ANTIGRAVITY_PERSONA,
  HOST_INSTRUCTIONS_HEADER,
  personaInstruction,
  planSystemInstruction,
  systemPromptMode,
} from "../src/stream/system-prompt.js";

const HOST = "You are a coding assistant running inside pi. Follow the project rules.";
const BLOCKED_LEGACY_TEXT = "pair programming with a user to solve coding tasks";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const CLEAN = {
  ANTIGRAVITY_SYSTEM_PROMPT: undefined,
  ANTIGRAVITY_SYSTEM_PROMPT_MODE: undefined,
  NOAGY_SYSTEM_PROMPT: undefined,
  NOAGY_SYSTEM_PROMPT_MODE: undefined,
};

// Persona identity comes from the Antigravity CLI's own wording.
assert.match(ANTIGRAVITY_PERSONA, /^You are Antigravity, a powerful agentic AI coding assistant/);
assert.match(ANTIGRAVITY_PERSONA, /Google DeepMind/);

// ------------------------------------------------------- default: persona-only
assert.equal(
  withEnv(CLEAN, systemPromptMode),
  "persona-only",
  "no host agent prompt may be mixed into systemInstruction by default",
);

const personaOnly = withEnv(CLEAN, () =>
  planSystemInstruction(HOST, ["<skill>alpha</skill>"]),
);
assert.deepEqual(
  personaOnly.systemParts,
  [ANTIGRAVITY_PERSONA, "<skill>alpha</skill>"],
  "systemInstruction carries only the persona plus injected task context",
);
for (const part of personaOnly.systemParts) {
  assert.ok(!part.includes("coding assistant running inside pi"), "host prompt stays out of it");
}
assert.equal(
  personaOnly.hostInstruction,
  `${HOST_INSTRUCTIONS_HEADER}\n${HOST}`,
  "host prompt moves to the conversation",
);

// No host prompt: persona plus the no-preamble directive, and no host block.
const personaOnlyNoHost = withEnv(CLEAN, () => planSystemInstruction("   ", []));
assert.deepEqual(personaOnlyNoHost.systemParts, [
  ANTIGRAVITY_PERSONA,
  ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION,
]);
assert.equal(personaOnlyNoHost.hostInstruction, undefined);

// ------------------------------------------------------------ custom persona
const custom = withEnv({ ...CLEAN, ANTIGRAVITY_SYSTEM_PROMPT: "  You are a custom antigravity agent.  " }, () => {
  assert.equal(personaInstruction(), "You are a custom antigravity agent.");
  return planSystemInstruction(HOST, []);
});
assert.deepEqual(custom.systemParts, ["You are a custom antigravity agent."]);
assert.equal(custom.hostInstruction, `${HOST_INSTRUCTIONS_HEADER}\n${HOST}`);

// Blank override is ignored rather than sending an empty instruction part.
withEnv({ ...CLEAN, ANTIGRAVITY_SYSTEM_PROMPT: "   " }, () => {
  assert.equal(personaInstruction(), ANTIGRAVITY_PERSONA);
});

// --------------------------------------------------------- opt-in: append mode
const append = withEnv({ ...CLEAN, ANTIGRAVITY_SYSTEM_PROMPT_MODE: "append" }, () =>
  planSystemInstruction(HOST, []),
);
assert.deepEqual(append.systemParts, [
  ANTIGRAVITY_PERSONA,
  `${HOST_INSTRUCTIONS_HEADER}\n${HOST}`,
]);
assert.equal(append.hostInstruction, undefined, "append mode keeps everything in systemInstruction");

const appendNoHost = withEnv({ ...CLEAN, ANTIGRAVITY_SYSTEM_PROMPT_MODE: "append" }, () =>
  planSystemInstruction("", []),
);
assert.deepEqual(appendNoHost.systemParts, [ANTIGRAVITY_PERSONA, ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION]);

// ----------------------------------------------------- opt-in: legacy rollback
const legacy = withEnv({ ...CLEAN, ANTIGRAVITY_SYSTEM_PROMPT_MODE: "host-only" }, () =>
  planSystemInstruction(HOST, []),
);
assert.deepEqual(legacy.systemParts, [HOST], "host-only restores the previous behavior");
assert.equal(legacy.hostInstruction, undefined);
const legacyEmpty = withEnv({ ...CLEAN, ANTIGRAVITY_SYSTEM_PROMPT_MODE: "host-only" }, () =>
  planSystemInstruction(undefined, []),
);
assert.deepEqual(legacyEmpty.systemParts, [ANTIGRAVITY_PERSONA, ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION]);

// Unknown mode values fall back to persona-only instead of leaking the host prompt in.
const unknownMode = withEnv({ ...CLEAN, ANTIGRAVITY_SYSTEM_PROMPT_MODE: "bogus" }, () =>
  planSystemInstruction(HOST, []),
);
assert.deepEqual(unknownMode.systemParts, [ANTIGRAVITY_PERSONA]);
assert.ok(unknownMode.hostInstruction);

// Legacy NOAGY_ prefix keeps working.
const legacyPrefix = withEnv(
  { ...CLEAN, NOAGY_SYSTEM_PROMPT_MODE: "append" },
  () => planSystemInstruction(HOST, []),
);
assert.equal(legacyPrefix.systemParts.length, 2);

// ------------------------------------------------------ no blocked instruction
const allParts = [
  ...personaOnly.systemParts,
  ...append.systemParts,
  ...legacy.systemParts,
  ...planSystemInstruction(undefined, []).systemParts,
];
for (const part of allParts) {
  assert.ok(
    !part.toLowerCase().includes(BLOCKED_LEGACY_TEXT),
    "the instruction Google rejected must not be sent any more",
  );
}

console.log("test-system-prompt: ok");
