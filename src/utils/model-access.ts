// pi-hub model-access support: the hub credential broker publishes the
// account's model whitelist as settings.json's `pihubModelAccess` key
// (rewritten on every credential sync, so a plain restart picks up changes)
// and as the PIHUB_MODEL_ACCESS environment variable (fixed at container
// creation). This module resolves the "antigravity" entry and filters model
// catalogs with it. This only controls what the picker displays; the hub
// credential gateway still enforces the whitelist on every request.

import fs from "node:fs";
import path from "node:path";
import { PROVIDER_ID } from "../models/models.js";

type ModelDefinition = { id: string } & Record<string, unknown>;

function entryFromSettings(): unknown {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR ||
    (process.env.HOME ? path.join(process.env.HOME, ".pi", "agent") : undefined);
  if (!agentDir) return undefined;
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(agentDir, "settings.json"), "utf8")) as {
      pihubModelAccess?: Record<string, unknown>;
    } | null;
    return settings && typeof settings === "object"
      ? settings.pihubModelAccess?.[PROVIDER_ID]
      : undefined;
  } catch {
    return undefined;
  }
}

function entryFromEnv(): unknown {
  const raw = process.env.PIHUB_MODEL_ACCESS;
  if (!raw) return undefined;
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    return payload && typeof payload === "object" ? payload[PROVIDER_ID] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The whitelist ids for this provider, or null when unrestricted.
 * An empty set means "hide every model" (provider disabled or no matches).
 */
export function antigravityModelAccess(): Set<string> | null {
  const entry = entryFromSettings() ?? entryFromEnv();
  if (!Array.isArray(entry)) return null;
  const ids = new Set<string>();
  for (const def of entry) {
    if (!def || typeof def !== "object") continue;
    const id = (def as Partial<ModelDefinition>).id;
    if (typeof id === "string" && id) ids.add(id);
  }
  return ids;
}

/** Filters a model catalog down to the hub-published whitelist. */
export function applyModelAccess<T extends { id: string }>(models: readonly T[]): T[] {
  const allowed = antigravityModelAccess();
  if (!allowed) return [...models];
  return models.filter((model) => {
    if (allowed.has(model.id)) return true;
    // Whitelists hold base ids ("gemini-3.8-flash"); runtime catalog entries
    // carry variant suffixes ("gemini-3.8-flash-high"). The hub gateway uses
    // the same base+suffix matching when enforcing at request time.
    for (const base of allowed) {
      if (model.id.startsWith(`${base}-`)) return true;
    }
    return false;
  });
}
