import { antigravityEnv } from "../utils/util.js";

/**
 * Antigravity's own agent identity, mirroring the persona the official CLI ships
 * (`You are Antigravity, a powerful agentic AI coding assistant designed by the
 * Google DeepMind team, working on Advanced Agentic Coding.`).
 *
 * The request's `systemInstruction` starts with this fixed text so the provider
 * identity is never erased by the host prompt. Override it with
 * `ANTIGRAVITY_SYSTEM_PROMPT` (or the legacy `NOAGY_SYSTEM_PROMPT`) — the text is
 * a static constant on purpose: it is not randomized, rewritten, or otherwise
 * mutated per request.
 */
export const ANTIGRAVITY_PERSONA = [
  "You are Antigravity, a powerful agentic AI coding assistant designed by the Google DeepMind team, working on Advanced Agentic Coding.",
  "You work as a pair programmer inside the user's workspace: inspect the code and command output before editing, prefer the smallest correct change, verify with the project's own commands, and report the outcome concisely.",
].join(" ");

export const ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION =
  'CRITICAL: NEVER output rule checks, formatting guidelines, constraint checklists (e.g. "No emdashes"), or your thinking/personality preambles in the final response. Output only the final response.';

/** Separator used when the host prompt is appended after the persona. */
export const HOST_INSTRUCTIONS_HEADER = "# Host instructions";

export type SystemPromptMode = "append" | "host-only";

/**
 * How the `systemInstruction` is composed, from `ANTIGRAVITY_SYSTEM_PROMPT_MODE`:
 * - `append` (default): Antigravity persona first, then the host prompt.
 * - `host-only`: the pre-0.11.1 behavior (host prompt replaces the persona),
 *   kept as a rollback switch. Unknown values fall back to `append`.
 */
export function systemPromptMode(): SystemPromptMode {
  return antigravityEnv("SYSTEM_PROMPT_MODE")?.trim().toLowerCase() === "host-only"
    ? "host-only"
    : "append";
}

/** Custom persona text from `ANTIGRAVITY_SYSTEM_PROMPT`, else the built-in constant. */
export function personaInstruction(): string {
  const custom = antigravityEnv("SYSTEM_PROMPT")?.trim();
  return custom || ANTIGRAVITY_PERSONA;
}

/**
 * Build the ordered `systemInstruction` parts: persona (unless `host-only`), the
 * host prompt as a labelled section, then any skill blocks the host injected.
 * Callers are responsible for `sanitizeText` on each returned part.
 */
export function resolveSystemPromptParts(
  hostPrompt: string | undefined,
  skillTexts: readonly string[] = [],
): string[] {
  const host = (hostPrompt ?? "").trim();
  const persona = personaInstruction();
  const parts: string[] = [];

  if (systemPromptMode() === "host-only" && host) {
    parts.push(host);
  } else {
    parts.push(persona);
    parts.push(host ? `${HOST_INSTRUCTIONS_HEADER}\n${host}` : ANTIGRAVITY_NO_PREAMBLE_INSTRUCTION);
  }

  for (const skill of skillTexts) {
    const text = (skill ?? "").trim();
    if (text) parts.push(text);
  }
  return parts;
}
