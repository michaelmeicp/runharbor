import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join, resolve } from "node:path";

// No model calls, no real credential reads. All denied-read targets are canaries.
const cli = process.env.RUNHARBOR_CODEX_BINARY || "codex";
const root = mkdtempSync(join(tmpdir(), "runharbor-m0-"));
const workspace = join(root, "workspace");
const fakeHome = join(root, "home");
mkdirSync(workspace);
mkdirSync(fakeHome);
const targets = [
  ".ssh/canary",
  ".codex/auth.json",
  ".claude/.credentials.json",
  ".runharbor/runharbor.db",
  "other-project/canary",
  "main-repo/refs/heads/main",
];
for (const target of targets) {
  const p = join(fakeHome, target);
  mkdirSync(resolve(p, ".."), { recursive: true });
  writeFileSync(p, "SYNTHETIC-CANARY");
}
writeFileSync(join(workspace, "allowed.txt"), "SYNTHETIC-CANARY");
const env = {
  PATH: process.env.PATH || "/usr/bin:/bin",
  HOME: fakeHome,
  LANG: "C",
  TERM: "dumb",
};
const version = spawnSync(cli, ["--version"], {
  encoding: "utf8",
  env,
  timeout: 10000,
});
const help = spawnSync(cli, ["sandbox", "--help"], {
  encoding: "utf8",
  env,
  timeout: 10000,
});
const report = {
  format: 1,
  observed_at: new Date().toISOString(),
  platform: platform(),
  agent_version: version.status === 0 ? version.stdout.trim() : null,
  scope: "Synthetic filesystem probes only; not full SEC-063 acceptance",
  results: [],
};
try {
  for (const tier of [0, 1, 2]) {
    const profile = tier === 0 ? ":read-only" : ":workspace";
    const code = `const fs=require('node:fs'); const out={}; const attempt=(fn)=>{try{fn();return true}catch{return false}}; out.workspace_read=attempt(()=>fs.readFileSync(${JSON.stringify(join(workspace, "allowed.txt"))})); out.outside_reads=${JSON.stringify(targets)}.map(p=>({target:p,allowed:attempt(()=>fs.readFileSync(${JSON.stringify(fakeHome)}+'/'+p))})); out.outside_write=attempt(()=>fs.writeFileSync(${JSON.stringify(join(fakeHome, ".bashrc"))},'SYNTHETIC')); out.refs_write=attempt(()=>fs.writeFileSync(${JSON.stringify(join(fakeHome, "main-repo/refs/heads/main"))},'SYNTHETIC')); out.workspace_write=attempt(()=>fs.writeFileSync(${JSON.stringify(join(workspace, "write-test"))},'SYNTHETIC')); console.log(JSON.stringify(out));`;
    const args = help.stdout?.includes("--permission-profile")
      ? [
          "sandbox",
          "-P",
          profile,
          "-C",
          workspace,
          "--",
          process.execPath,
          "-e",
          code,
        ]
      : [
          "sandbox",
          platform() === "darwin" ? "macos" : "linux",
          "-c",
          `sandbox_mode="${tier === 0 ? "read-only" : "workspace-write"}"`,
          "--",
          process.execPath,
          "-e",
          code,
        ];
    const result = spawnSync(cli, args, {
      encoding: "utf8",
      env,
      cwd: workspace,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    let observation;
    try {
      observation = JSON.parse(result.stdout.trim());
    } catch {
      observation = null;
    }
    const safe =
      result.status === 0 &&
      observation?.workspace_read === true &&
      observation.outside_reads.every((x) => !x.allowed) &&
      !observation.outside_write &&
      !observation.refs_write &&
      observation.workspace_write === (tier !== 0);
    report.results.push({
      tier,
      profile,
      exit_code: result.status,
      observation,
      passed: !!safe,
      error:
        result.error?.code ||
        (observation ? null : "probe did not return a valid observation"),
    });
  }
  report.passed = report.results.every((r) => r.passed);
  const output = JSON.stringify(report, null, 2) + "\n";
  if (process.argv[2]) writeFileSync(process.argv[2], output, { mode: 0o600 });
  process.stdout.write(output);
  process.exitCode = report.passed ? 0 : 1;
} finally {
  rmSync(root, { recursive: true, force: true });
}
