#!/usr/bin/env node
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createApp } from "./server.js";

const [command = "start", ...args] = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dataDir = resolve(
  option("--data-dir") ||
    process.env.RUNHARBOR_DATA_DIR ||
    join(homedir(), ".runharbor"),
);
if (process.getuid?.() === 0) {
  console.error("RunHarbor refuses to run as root. Use a normal user account.");
  process.exit(1);
}
if (command === "stop-all") {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dataDir, "STOP"), "Emergency stop requested by CLI\n", {
    mode: 0o600,
  });
  console.log(
    "Emergency stop requested. The running service checks the sentinel every second.",
  );
} else if (command === "doctor") {
  const probe = (binary, argv) => {
    const r = spawnSync(binary, argv, {
      encoding: "utf8",
      timeout: 5000,
      env: { PATH: process.env.PATH, HOME: homedir(), LANG: "en_US.UTF-8" },
    });
    return r.status === 0 ? r.stdout.trim().slice(0, 200) : "unavailable";
  };
  console.log(
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        git: probe("git", ["--version"]),
        codex: probe("codex", ["--version"]),
        claude: probe("claude", ["--version"]),
        bubblewrap:
          process.platform === "linux"
            ? probe("bwrap", ["--version"])
            : "not applicable",
        data_directory_permissions: existsSync(dataDir)
          ? (statSync(dataDir).mode & 0o777).toString(8)
          : "created at first start",
        execution: "mock-only",
        live_agents: "blocked: complete M0 isolation tests before enabling",
        full_disk_encryption:
          "unknown — verify FileVault or LUKS in your operating system",
        remote_access: "disabled",
      },
      null,
      2,
    ),
  );
} else if (command === "start") {
  process.umask(0o077);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const lock = join(dataDir, "service.lock");
  let fd;
  try {
    fd = openSync(lock, "wx", 0o600);
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
  } catch {
    console.error(
      "A service lock exists. Stop the running service first. After a crash, verify no service is running before removing service.lock.",
    );
    process.exit(1);
  }
  let app;
  const release = () => {
    try {
      unlinkSync(lock);
    } catch {}
  };
  try {
    const port = Number(option("--port") || process.env.PORT || 4317);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Choose a port between 1 and 65535.");
    app = await createApp({
      dataDir,
      port,
      host: process.env.HOST || "127.0.0.1",
    });
  } catch (e) {
    release();
    console.error(e.message);
    process.exit(1);
  }
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    release();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} else {
  console.log(
    "RunHarbor\n\n  start [--port 4317] [--data-dir PATH]\n  doctor [--data-dir PATH]\n  stop-all [--data-dir PATH]\n\nRequires Node.js 24.13+. This development build runs only the local mock agent.",
  );
  process.exitCode = command === "help" || command === "--help" ? 0 : 1;
}
