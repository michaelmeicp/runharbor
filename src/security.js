import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import {
  realpathSync,
  lstatSync,
  openSync,
  closeSync,
  fstatSync,
  constants,
  readFileSync,
} from "node:fs";
import { resolve, relative, sep, isAbsolute } from "node:path";
import { homedir } from "node:os";

const scrypt = promisify(scryptCallback);
export const sha = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export class AppError extends Error {
  constructor(message, status = 400, code = "invalid_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function insist(condition, message, status = 400, code) {
  if (!condition) throw new AppError(message, status, code);
}
export function text(value, name = "Value", max = 4000, optional = false) {
  insist(
    typeof value === "string" &&
      !value.includes("\0") &&
      [...value].length <= max &&
      (optional || value.trim().length > 0),
    `${name} must contain ${optional ? "0" : "1"}–${max} characters.`,
  );
  return value.trim();
}
export function number(value, min, max, fallback) {
  if (value === undefined) return fallback;
  insist(
    Number.isInteger(value) && value >= min && value <= max,
    `Number must be between ${min} and ${max}.`,
  );
  return value;
}
export function choice(value, allowed, fallback) {
  value ??= fallback;
  insist(allowed.includes(value), `Choose one of: ${allowed.join(", ")}.`);
  return value;
}

/** Redact before persistence or streaming. A conservative baseline, not a substitute for gitleaks. */
export function redact(value, secrets = []) {
  let result = String(value)
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  for (const secret of secrets.filter(
    (s) => typeof s === "string" && s.length >= 6,
  )) {
    for (const encoded of [
      secret,
      encodeURIComponent(secret),
      Buffer.from(secret).toString("base64"),
    ])
      result = result.split(encoded).join("[REDACTED]");
  }
  return result
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/g,
      "[REDACTED]",
    )
    .replace(
      /((?:authorization|api[_-]?key|password|secret|access[_-]?token)\s*[=:]\s*)(?:Bearer\s+)?[^\s,;"}]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      "[REDACTED PRIVATE KEY]",
    );
}
export async function hashPassword(password) {
  insist(
    typeof password === "string" &&
      password.length >= 12 &&
      password.length <= 256,
    "Use a password of 12–256 characters.",
  );
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password, saved) {
  if (typeof password !== "string" || password.length > 256) return false;
  const [salt, hash] = saved.split(":");
  const actual = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export function within(root, path) {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
  );
}
export function safeProjectPath(path, dataDir) {
  text(path, "Project path", 2048);
  insist(
    isAbsolute(path) && !path.split(/[\\/]/).includes(".."),
    "Choose an absolute project directory without traversal.",
  );
  let real;
  try {
    real = realpathSync(path);
  } catch {
    throw new AppError("The project directory does not exist.");
  }
  const canonicalData = realpathSync(dataDir);
  const denied = ["/", homedir(), canonicalData].map((p) => realpathSync(p));
  insist(
    !denied.some((p) => real === p) &&
      !within(canonicalData, real) &&
      !within(real, canonicalData),
    "Choose a project folder, not your home, system, or application data directory.",
  );
  const system = [
    "/etc",
    "/private/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/System",
    "/Library",
    "/proc",
    "/sys",
    "/dev",
  ];
  insist(
    !system.some((p) => within(p, real)) && lstatSync(real).isDirectory(),
    "This is not an allowed project directory.",
  );
  return real;
}
/** Open a regular file after checking every directory; validate the open inode too. */
export function readSafe(root, path, limit = 5 * 1024 * 1024) {
  const base = realpathSync(root),
    target = resolve(base, path);
  insist(within(base, target), "Path outside allowed directory.", 403);
  let cursor = base;
  for (const part of relative(base, target).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    insist(
      !lstatSync(cursor).isSymbolicLink(),
      "Symbolic links are not allowed.",
      403,
    );
  }
  const canonical = realpathSync(target);
  insist(within(base, canonical), "Path outside allowed directory.", 403);
  const before = lstatSync(canonical),
    fd = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const after = fstatSync(fd);
    insist(
      after.isFile() &&
        after.ino === before.ino &&
        after.dev === before.dev &&
        after.size <= limit,
      "Unsafe or oversized file.",
      403,
    );
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function boundary(req, origin) {
  const expected = new URL(origin);
  insist(req.headers.host === expected.host, "Host is not allowed.", 403);
  insist(
    !req.headers["x-forwarded-host"] &&
      !req.headers["x-forwarded-for"] &&
      !req.headers.forwarded,
    "Remote proxy mode is unavailable.",
    403,
  );
  if (req.headers.origin)
    insist(req.headers.origin === origin, "Origin is not allowed.", 403);
  if (req.headers["sec-fetch-site"])
    insist(
      ["same-origin", "none"].includes(req.headers["sec-fetch-site"]),
      "Cross-site request blocked.",
      403,
    );
  if (!["GET", "HEAD"].includes(req.method)) {
    insist(
      req.headers.origin === origin,
      "A same-origin request is required.",
      403,
    );
    insist(
      req.headers["content-type"]?.split(";")[0] === "application/json",
      "Send application/json.",
      415,
    );
  }
}
