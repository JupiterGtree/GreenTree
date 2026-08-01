/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const ENV_FILE = "/etc/greentree/greentree.env";

function loadShellEnvironment(file) {
  if (!fs.existsSync(file)) return {};

  const output = execFileSync(
    "bash",
    ["-lc", 'set -e; set -a; . "$1"; env -0', "bash", file],
    { encoding: "buffer" },
  );

  return Object.fromEntries(
    output
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

module.exports = {
  apps: [
    {
      name: "greentree",
      cwd: "/var/www/greentree/app",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "750M",
      time: true,
      env: {
        ...loadShellEnvironment(ENV_FILE),
        NODE_ENV: "production",
      },
    },
    {
      name: "greentree-telegram-worker",
      cwd: "/var/www/greentree/app",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/scripts/telegram-worker.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      time: true,
      env: {
        ...loadShellEnvironment(ENV_FILE),
        NODE_ENV: "production",
        TELEGRAM_NOTIFICATION_WORKER_ENABLED: "true",
      },
    },
  ],
};
