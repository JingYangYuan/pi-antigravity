import { antigravityEnv } from "../utils/util.js";

/**
 * Antigravity's own agent identity, mirroring the persona the official CLI ships
 * (`You are Antigravity, a powerful agentic AI coding assistant designed by the
 * Google DeepMind team, working on Advanced Agentic Coding.`).
 *
 * Override the text with `ANTIGRAVITY_SYSTEM_PROMPT` (or the legacy
 * `NOAGY_SYSTEM_PROMPT`). It is a static constant on purpose: it is never
 * randomized, rewritten, or otherwise mutated per request.
 */
export const ANTIGRAVITY_PERSONA = [
  "You are Antigravity, a powerful agentic AI coding assistant designed by the Google DeepMind team, working on Advanced Agentic Coding.",
  "You work as a pair programmer inside the user's workspace: inspect the code and command output before editing, prefer the smallest correct change, verify with the project's own commands, and report the outcome concisely.",
].join(" ");

export const ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION =
  'CRITICAL: NEVER output rule checks, formatting guidelines, constraint checklists (e.g. "No emdashes"), or your thinking/personality preambles in the final response. Output only the final response.';

/** Labelled section that carries the host agent's instructions. */
export const HOST_INSTRUCTIONS_HEADER = "# Host instructions";

/**
 * How the request carries the host prompt, from `ANTIGRAVITY_SYSTEM_PROMPT_MODE`:
 * - `persona-only` (default): `systemInstruction` is the Antigravity persona only;
 *   the host prompt travels in the conversation as a leading user-turn block, so no
 *   host agent prompt is ever mixed into the provider's system instruction.
 * - `append`: persona first, then the host prompt inside `systemInstruction`.
 * - `host-only`: the pre-0.11.1 behaviour (host prompt replaces the persona).
 * Unknown values fall back to `persona-only`.
 */
export type SystemPromptMode = "persona-only" | "append" | "host-only";

export function systemPromptMode(): SystemPromptMode {
  const raw = antigravityEnv("SYSTEM_PROMPT_MODE")?.trim().toLowerCase();
  if (raw === "append") return "append";
  if (raw === "host-only") return "host-only";
  return "persona-only";
}

/** Custom persona text from `ANTIGRAVITY_SYSTEM_PROMPT`, else the built-in constant. */
export function personaInstruction(): string {
  const custom = antigravityEnv("SYSTEM_PROMPT")?.trim();
  return custom || ANTIGRAVITY_PERSONA;
}

export type SystemInstructionPlan = {
  /** Parts for `systemInstruction`. Callers must `sanitizeText` each part. */
  systemParts: string[];
  /** Host prompt to place in the conversation (persona-only mode), already labelled. */
  hostInstruction?: string;
};

/**
 * Decide what goes into `systemInstruction` and what goes into the conversation.
 *
 * Skill blocks stay in `systemInstruction` in every mode: they are task context the
 * host injected, not the host agent's own system prompt.
 */
export function planSystemInstruction(
  hostPrompt: string | undefined,
  skillTexts: readonly string[] = [],
): SystemInstructionPlan {
  const host = (hostPrompt ?? "").trim();
  const persona = personaInstruction();
  const mode = systemPromptMode();
  const systemParts: string[] = [];
  let hostInstruction: string | undefined;

  if (mode === "host-only" && host) {
    // Legacy: the host prompt replaces the persona entirely.
    systemParts.push(host);
  } else {
    systemParts.push(persona);
    if (mode === "append" && host) {
      systemParts.push(`${HOST_INSTRUCTIONS_HEADER}\n${host}`);
    } else if (mode === "append" || mode === "host-only") {
      systemParts.push(ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION);
    } else if (host) {
      // persona-only: the host prompt leaves systemInstruction for the user turn.
      hostInstruction = `${HOST_INSTRUCTIONS_HEADER}\n${host}`;
    } else {
      systemParts.push(ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION);
    }
  }

  for (const skill of skillTexts) {
    const text = (skill ?? "").trim();
    if (text) systemParts.push(text);
  }
  return { systemParts, hostInstruction };
}
