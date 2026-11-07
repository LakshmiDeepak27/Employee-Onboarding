const { spawnSync } = require("node:child_process");
const path = require("node:path");
const rootEnv = path.resolve(__dirname, "../../../.env");
const dotenv = require("dotenv");

dotenv.config({ path: rootEnv });
const env = {
  ...process.env,
  SEED_REFERENCE_DATA: "true",
  SEED_PRESENTATION_USERS: "true",
  SEED_DEMO_DATA: "false",
};
const wrapper = path.resolve(__dirname, "with-root-env.cjs");

for (const script of ["prisma/seed.ts", "prisma/seed-templates.ts"]) {
  const result = spawnSync(process.execPath, [wrapper, "tsx", script], {
    cwd: path.resolve(__dirname, ".."),
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
