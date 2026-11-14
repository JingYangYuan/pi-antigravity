import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultProjectId, loadCodeAssist } from "../client/client.js";
import type { AntigravityOAuthCredentials } from "../types/types.js";
import { rememberAccount, writeActiveCredential, type StoredAccount } from "./accounts.js";
import { getUserEmail, refreshAntigravityToken } from "./oauth.js";

export const DEFAULT_AGY_CREDS_PATH = join(homedir(), ".gemini", "oauth_creds.json");

export interface RawAgyCliCreds {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  expiry_date?: number;
}

export function resolveAgyCredsPath(customPath?: string): string {
  return customPath || process.env.ANTIGRAVITY_CLI_CREDS_PATH || DEFAULT_AGY_CREDS_PATH;
}

export function hasAgyCliCredentials(customPath?: string): boolean {
  const path = resolveAgyCredsPath(customPath);
  return existsSync(path);
}

export function readAgyCliCredentials(customPath?: string): RawAgyCliCreds | undefined {
  const path = resolveAgyCredsPath(customPath);
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const creds = parsed as Record<string, unknown>;
    if (typeof creds.refresh_token !== "string" || !creds.refresh_token) {
      return undefined;
    }
    return {
      access_token: typeof creds.access_token === "string" ? creds.access_token : undefined,
      refresh_token: creds.refresh_token,
      scope: typeof creds.scope === "string" ? creds.scope : undefined,
      token_type: typeof creds.token_type === "string" ? creds.token_type : undefined,
      id_token: typeof creds.id_token === "string" ? creds.id_token : undefined,
      expiry_date: typeof creds.expiry_date === "number" ? creds.expiry_date : undefined,
    };
  } catch {
    return undefined;
  }
}

export function extractEmailFromIdToken(idToken: string): string | undefined {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return undefined;
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { email?: unknown };
    return typeof payload.email === "string" && payload.email.includes("@")
      ? payload.email.trim().toLowerCase()
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Import or sync active credentials directly from official Google Antigravity CLI storage.
 * Completely eliminates browser OAuth interactions and prevents OAuth risk control triggers.
 */
export async function syncAgyCliCredentials(opts?: {
  credsPath?: string;
  forceRefresh?: boolean;
}): Promise<StoredAccount> {
  const rawCreds = readAgyCliCredentials(opts?.credsPath);
  if (!rawCreds || !rawCreds.refresh_token) {
    const targetPath = resolveAgyCredsPath(opts?.credsPath);
    throw new Error(
      `No valid Antigravity CLI credentials found at ${targetPath}. Please run 'agy' or ensure ~/.gemini/oauth_creds.json exists.`,
    );
  }

  let email: string | undefined;
  if (rawCreds.id_token) {
    email = extractEmailFromIdToken(rawCreds.id_token);
  }
  if (!email && rawCreds.access_token) {
    email = await getUserEmail(rawCreds.access_token);
  }

  const rawExpiry = rawCreds.expiry_date || 0;
  // If the access token is missing or expired within the next 5 minutes, or forced, refresh it
  let accessToken = rawCreds.access_token || "";
  let expires = rawExpiry > 0 ? rawExpiry - 5 * 60 * 1000 : 0;
  let projectId: string | undefined;

  const needsRefresh = opts?.forceRefresh || !accessToken || expires <= Date.now();

  if (needsRefresh) {
    const refreshed = await refreshAntigravityToken({
      refresh: rawCreds.refresh_token,
      access: accessToken,
      expires,
    });
    accessToken = refreshed.access;
    expires = refreshed.expires;
    projectId = refreshed.projectId;
    if (!email && refreshed.email) {
      email = refreshed.email;
    }
  } else {
    projectId =
      (await loadCodeAssist(accessToken)) || defaultProjectId(email || "antigravity-default");
  }

  const credentials: AntigravityOAuthCredentials = {
    refresh: rawCreds.refresh_token,
    access: accessToken,
    expires,
    projectId: projectId || defaultProjectId(email || "antigravity-default"),
    email,
  };

  const stored = rememberAccount(credentials);
  writeActiveCredential(stored);
  return stored;
}
