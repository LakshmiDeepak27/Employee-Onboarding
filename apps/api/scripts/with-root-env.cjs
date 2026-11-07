// npm workspace scripts run from apps/api, while the shared local .env lives
// at the repository root. Load it explicitly before launching Prisma/seed.
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-root-env.cjs <command> [...args]");
  process.exit(2);
}

const executable = command === "prisma"
  ? require.resolve("prisma/build/index.js")
  : command === "tsx"
    ? require.resolve("tsx/cli")
    : command;
const result = spawnSync(command === "prisma" || command === "tsx" ? process.execPath : executable,
  command === "prisma" || command === "tsx" ? [executable, ...args] : args,
  {
  stdio: "inherit",
  env: process.env,
  shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
