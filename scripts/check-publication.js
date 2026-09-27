import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Return categories, never the matched value: CI output is public too.
export function publicationFindings(path, content) {
  const findings = [];
  if (
    /(^|\/)(?:\.local|\.codex|\.claude|\.runharbor)(\/|$)/i.test(path) ||
    /(^|\/)(?:\.env[^/]*|auth\.json|\.credentials\.json|[^/]*requirements_final\.md)$/.test(
      path,
    ) ||
    /\.(?:db(?:-wal|-shm)?|sqlite3?|log|pem|key|tgz)$/i.test(path)
  )
    findings.push("private or runtime file");
  if (content.includes(0)) return findings; // Images need visual review.
  const text = content.toString("utf8");
  if (
    /\/(?:Users|home)\/[A-Za-z0-9][A-Za-z0-9._-]*\//.test(text) ||
    /[A-Za-z]:\\Users\\[A-Za-z0-9][A-Za-z0-9._-]*\\/.test(text)
  )
    findings.push("personal home path");
  if (/\/tmp\/codex-remote-attachments\//.test(text)) {
    findings.push("private attachment path");
  }
  return findings;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  let count = 0;
  for (const path of paths) {
    const findings = publicationFindings(path, readFileSync(path));
    for (const category of findings) {
      // Do not print the filename, which itself might contain private data.
      console.error(
        `Publication check: ${category} in tracked file #${paths.indexOf(path) + 1}. Review locally.`,
      );
      count++;
    }
  }
  if (count) process.exitCode = 1;
  else
    console.log(
      `Publication text/path check passed (${paths.length} tracked files); visual review and secret scanning are separate checks.`,
    );
}
