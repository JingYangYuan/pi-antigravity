#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const register = join(here, "register-ts.mjs");
// `--import` resolves its argument as a URL. A bare Windows path reads as the `c:`
// scheme and Node aborts with ERR_UNSUPPORTED_ESM_URL_SCHEME.
const registerUrl = pathToFileURL(register).href;
const result = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--disable-warning=ExperimentalWarning",
    "--disable-warning=DEP0205",
    `--import=${registerUrl}`,
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
