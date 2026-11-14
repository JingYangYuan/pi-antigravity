import assert from "node:assert/strict";
import {
  ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION,
  ANTIGRAVITY_PERSONA,
  HOST_INSTRUCTIONS_HEADER,
  personaInstruction,
  resolveSystemPromptParts,
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

// Persona identity comes from the Antigravity CLI's own wording.
assert.match(ANTIGRAVITY_PERSONA, /^You are Antigravity, a powerful agentic AI coding assistant/);
assert.match(ANTIGRAVITY_PERSONA, /Google DeepMind/);

// ---------------------------------------------------------------- default mode
assert.equal(
  withEnv({ ANTIGRAVITY_SYSTEM_PROMPT_MODE: undefined }, systemPromptMode),
  "append",
  "default mode appends the host prompt after the persona",
);

const appendParts = withEnv({ ANTIGRAVITY_SYSTEM_PROMPT_MODE: undefined }, () =>
  resolveSystemPromptParts(HOST, ["<skill>alpha</skill>"]),
);
assert.equal(appendParts.length, 3);
assert.equal(appendParts[0], ANTIGRAVITY_PERSONA, "persona is first");
assert.ok(appendParts[1]!.startsWith(HOST_INSTRUCTIONS_HEADER), "host prompt is a labelled section");
assert.ok(appendParts[1]!.endsWith(HOST));
assert.equal(appendParts[2], "<skill>alpha</skill>");

// No host prompt: persona plus the no-preamble directive, as before.
const noHostParts = withEnv({ ANTIGRAVITY_SYSTEM_PROMPT_MODE: undefined }, () =>
  resolveSystemPromptParts("   ", []),
);
assert.deepEqual(noHostParts, [ANTIGRAVITY_PERSONA, ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION]);

// ------------------------------------------------------------ custom persona
const customParts = withEnv(
  { ANTIGRAVITY_SYSTEM_PROMPT: "  You are a custom antigravity agent.  ", ANTIGRAVITY_SYSTEM_PROMPT_MODE: undefined },
  () => {
    assert.equal(personaInstruction(), "You are a custom antigravity agent.");
    return resolveSystemPromptParts(HOST, []);
  },
);
assert.equal(customParts[0], "You are a custom antigravity agent.");
assert.ok(customParts[1]!.startsWith(HOST_INSTRUCTIONS_HEADER));

// Blank override is ignored rather than sending an empty instruction part.
withEnv({ ANTIGRAVITY_SYSTEM_PROMPT: "   " }, () => {
  assert.equal(personaInstruction(), ANTIGRAVITY_PERSONA);
});

// -------------------------------------------------------------- rollback mode
const legacyParts = withEnv({ ANTIGRAVITY_SYSTEM_PROMPT_MODE: "host-only" }, () =>
  resolveSystemPromptParts(HOST, []),
);
assert.deepEqual(legacyParts, [HOST], "host-only restores the previous single-part behavior");
const legacyEmptyParts = withEnv({ ANTIGRAVITY_SYSTEM_PROMPT_MODE: "host-only" }, () =>
  resolveSystemPromptParts(undefined, []),
);
assert.deepEqual(legacyEmptyParts, [ANTIGRAVITY_PERSONA, ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION]);

// Unknown mode values fall back to append instead of disabling the persona.
const unknownModeParts = withEnv({ ANTIGRAVITY_SYSTEM_PROMPT_MODE: "bogus" }, () =>
  resolveSystemPromptParts(HOST, []),
);
assert.equal(unknownModeParts[0], ANTIGRAVITY_PERSONA);

// Legacy NOAGY_ prefix keeps working for both knobs.
const legacyPrefixParts = withEnv(
  { NOAGY_SYSTEM_PROMPT_MODE: "host-only", ANTIGRAVITY_SYSTEM_PROMPT_MODE: undefined },
  () => resolveSystemPromptParts(HOST, []),
);
assert.deepEqual(legacyPrefixParts, [HOST]);

// ------------------------------------------------------ no blocked instruction
const allParts = [
  ...resolveSystemPromptParts(HOST, []),
  ...resolveSystemPromptParts(undefined, []),
  ...legacyParts,
];
for (const part of allParts) {
  assert.ok(
    !part.toLowerCase().includes(BLOCKED_LEGACY_TEXT),
    "the instruction Google rejected must not be sent any more",
  );
}

console.log("test-system-prompt: ok");
