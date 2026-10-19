import { REQUIRED_ENV, loadEnvLocal } from "./env";

/** Runs once in the main process, so the notice is visible even when every test is skipped. Prints names only. */
export default function setup() {
  loadEnvLocal();
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    process.stdout.write(
      `\n[rls] LIVE TEST NOT RUN: every test will be SKIPPED (a skip is not a pass).\n` +
        `[rls] Missing in .env.local: ${missing.join(", ")}\n` +
        `[rls] See WORK_LOG.md (Milestone 2b) for how to create the two test users.\n\n`,
    );
  } else {
    process.stdout.write("\n[rls] All required variables found (values not shown). Running live tests.\n\n");
  }
}
