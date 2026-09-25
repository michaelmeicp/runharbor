import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./db.js";
import { Engine } from "./engine.js";
import {
  boundary,
  insist,
  AppError,
  token,
  sha,
  hashPassword,
  verifyPassword,
  text,
  number,
  readSafe,
} from "./security.js";
import { nextDates } from "./schedule.js";
import { contextFor, tierToArgs } from "./policy.js";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "../web");
const files = {
  "/": "index.html",
  "/app.js": "app.js",
  "/styles.css": "styles.css",
  "/logo.svg": "logo.svg",
};
const types = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
};
const cookieName = "runharbor_session";
export async function createApp({
  dataDir,
  port = 4317,
  host = "127.0.0.1",
  mockDelay = 250,
  clock,
  log = console.log,
  startEngine = true,
} = {}) {
  insist(
    host === "127.0.0.1",
    "Only 127.0.0.1 is supported. Remote access is disabled.",
  );
  const store = new Store(dataDir),
    engine = new Engine(store, { delay: mockDelay, clock });
  const sessions = new Map(),
    streams = new Set();
  let origin,
    setupToken = store.setting("password") ? null : token(),
    loginFailures = 0,
    blockedUntil = 0,
    setupInProgress = false;
  function authenticate(req) {
    const cookies = Object.fromEntries(
      (req.headers.cookie || "")
        .split(";")
        .filter((s) => s.includes("="))
        .map((s) => {
          const i = s.indexOf("=");
          return [s.slice(0, i).trim(), s.slice(i + 1)];
        }),
    );
    const key = cookies[cookieName],
      s = key && sessions.get(sha(key));
    insist(
      s &&
        Date.now() - s.last < 12 * 3600000 &&
        Date.now() - s.created < 7 * 86400000,
      "Please sign in.",
      401,
    );
    s.last = Date.now();
    return s;
  }
  function issueSession(res) {
    const key = token(),
      session = {
        id: sha(key),
        csrf: token(),
        created: Date.now(),
        last: Date.now(),
      };
    sessions.set(session.id, session);
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`,
    );
    return session;
  }
  async function body(req) {
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      insist(size <= 65536, "Request body exceeds 64 KB.", 413);
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch {
      throw new AppError("Invalid JSON.");
    }
  }
  function send(res, value, status = 200) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(value));
  }
  const server = createServer(async (req, res) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    try {
      boundary(req, origin);
      const url = new URL(req.url, origin),
        path = url.pathname,
        method = req.method;
      if (path === "/healthz" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
        return;
      }
      if (files[path] && method === "GET") {
        const name = files[path];
        res.writeHead(200, { "Content-Type": types[name.split(".").pop()] });
        res.end(readFileSync(joinWeb(name)));
        return;
      }
      if (path === "/auth/status" && method === "GET") {
        let logged = false;
        try {
          authenticate(req);
          logged = true;
        } catch {}
        send(res, {
          setup_required: !store.setting("password"),
          authenticated: logged,
        });
        return;
      }
      if (
        (path === "/auth/setup" || path === "/auth/login") &&
        method === "POST"
      ) {
        insist(
          Date.now() >= blockedUntil,
          "Too many attempts. Try again in one minute.",
          429,
        );
        const input = await body(req);
        let valid = false;
        if (path === "/auth/setup") {
          insist(
            !store.setting("password") && !setupInProgress,
            "Setup is already complete or in progress.",
            409,
          );
          if (
            typeof input.setup_token === "string" &&
            sha(input.setup_token) === sha(setupToken || "")
          ) {
            setupInProgress = true;
            try {
              const password = await hashPassword(input.password);
              store.setting("password", password, true);
              setupToken = null;
              valid = true;
            } finally {
              setupInProgress = false;
            }
          }
        } else {
          const password = store.setting("password");
          insist(password, "Complete first-run setup.", 409);
          valid = await verifyPassword(input.password, password);
        }
        if (!valid) {
          loginFailures++;
          if (loginFailures >= 10) {
            blockedUntil = Date.now() + 60000;
            loginFailures = 0;
          }
          store.audit("login_failed");
          throw new AppError("Invalid credentials.", 401);
        }
        loginFailures = 0;
        const session = issueSession(res);
        store.audit("login");
        send(res, { csrf: session.csrf });
        return;
      }
      const session = authenticate(req);
      if (!["GET", "HEAD"].includes(method))
        insist(
          req.headers["x-csrf-token"] === session.csrf,
          "Invalid CSRF token.",
          403,
        );
      if (path === "/api/session" && method === "GET") {
        send(res, { csrf: session.csrf });
        return;
      }
      if (path === "/api/logout" && method === "POST") {
        sessions.delete(session.id);
        for (const stream of streams)
          if (stream.session === session.id) stream.res.end();
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
        );
        store.audit("logout");
        send(res, { ok: true });
        return;
      }
      if (path === "/api/events" && method === "GET") {
        insist(
          !url.searchParams.has("token"),
          "Authentication tokens are not accepted in URLs.",
          400,
        );
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          Connection: "keep-alive",
        });
        res.write("event: connected\ndata: {}\n\n");
        const stream = { session: session.id, res };
        streams.add(stream);
        const event = (e) => {
          if (!res.write(`event: run\ndata: ${JSON.stringify(e)}\n\n`))
            res.end();
        };
        const change = () => res.write("event: change\ndata: {}\n\n");
        engine.on("event", event);
        engine.on("change", change);
        const heartbeat = setInterval(() => {
          try {
            authenticate(req);
            res.write(": heartbeat\n\n");
          } catch {
            res.end();
          }
        }, 4000);
        res.on("close", () => {
          clearInterval(heartbeat);
          streams.delete(stream);
          engine.off("event", event);
          engine.off("change", change);
        });
        return;
      }
      if (path === "/api/state" && method === "GET") {
        send(res, {
          projects: store.all("projects"),
          tasks: store.all("tasks"),
          schedules: store.all("schedules"),
          runs: store.all("runs", null, 200),
          inbox: store.all("inbox"),
          artifacts: store.all("artifacts"),
          profiles: store.all("profiles"),
          quotas: store.all("quotas"),
          failovers: store.all("failovers"),
          memories: store.all("memories"),
          destinations: store.all("destinations"),
          deliveries: store.all("deliveries"),
          approvals: store.all("approvals"),
          status: {
            paused: store.setting("paused", false),
            stopped: engine.stopped(),
            heartbeat: engine.heartbeat,
            active: engine.active.size,
            daily_run_limit: store.setting("daily_run_limit", 100),
            build: "0.1.0-alpha.1",
            execution: "mock-only",
            live_agents: "blocked_pending_M0",
            fde: "unknown",
            audit: store.verifyAudit(),
          },
        });
        return;
      }
      if (path === "/api/search" && method === "GET") {
        send(res, store.find(url.searchParams.get("q") || ""));
        return;
      }
      if (path === "/api/audit" && method === "GET") {
        send(res, {
          integrity: store.verifyAudit(),
          events: store.auditRows(),
        });
        return;
      }
      if (path === "/api/cron-preview" && method === "POST") {
        const b = await body(req);
        send(res, { dates: nextDates(b.cron_expr, b.timezone) });
        return;
      }
      if (path === "/api/projects" && method === "POST") {
        send(res, engine.project(await body(req)), 201);
        return;
      }
      if (path === "/api/tasks" && method === "POST") {
        const b = await body(req),
          t = engine.task(b);
        if (b.run) engine.enqueue({ task_id: t.id });
        send(res, t, 201);
        return;
      }
      if (path === "/api/schedules" && method === "POST") {
        send(res, engine.schedule(await body(req)), 201);
        return;
      }
      if (path === "/api/demo" && method === "POST") {
        send(res, engine.demo(), 201);
        return;
      }
      if (path === "/api/pause" && method === "POST") {
        const b = await body(req);
        insist(typeof b.paused === "boolean", "paused must be a boolean.");
        engine.pause(b.paused);
        send(res, { ok: true });
        return;
      }
      if (path === "/api/stop" && method === "POST") {
        engine.stopAll();
        send(res, { ok: true });
        return;
      }
      if (path === "/api/resume" && method === "POST") {
        const b = await body(req);
        insist(b.confirmed, "Confirm resuming.");
        engine.resume();
        send(res, { ok: true });
        return;
      }
      if (path === "/api/inbox/batch" && method === "POST") {
        const b = await body(req);
        send(res, engine.inboxAction(b.ids, b.action));
        return;
      }
      if (path === "/api/inbox/undo" && method === "POST") {
        engine.undoInbox((await body(req)).id);
        send(res, { ok: true });
        return;
      }
      if (path === "/api/settings/budget" && method === "POST") {
        const b = await body(req);
        store.setting("daily_run_limit", number(b.limit, 1, 10000, 100), true);
        store.audit("budget_changed", { limit: b.limit });
        send(res, { ok: true });
        return;
      }
      let m = path.match(
        /^\/api\/projects\/([a-zA-Z0-9-]+)\/(archive|memory|failover|destination)$/,
      );
      if (m && method === "POST") {
        const b = await body(req);
        send(
          res,
          m[2] === "archive"
            ? engine.archive(m[1], b.archived !== false)
            : m[2] === "memory"
              ? engine.memory(m[1], b)
              : m[2] === "failover"
                ? engine.setFailover(m[1], b)
                : engine.destination(m[1], b),
        );
        return;
      }
      m = path.match(/^\/api\/tasks\/([a-zA-Z0-9-]+)\/run$/);
      if (m && method === "POST") {
        send(res, engine.enqueue({ task_id: m[1] }), 201);
        return;
      }
      m = path.match(
        /^\/api\/schedules\/([a-zA-Z0-9-]+)(?:\/(run|state|preview))?$/,
      );
      if (m && method === "POST") {
        const b = await body(req);
        if (m[2] === "run")
          send(
            res,
            engine.enqueue({
              schedule_id: m[1],
              trigger: b.is_test ? "test" : "manual",
              is_test: b.is_test === true,
            }),
            201,
          );
        else if (m[2] === "state")
          send(res, engine.scheduleState(m[1], b.status, b.confirmed === true));
        else if (m[2] === "preview") {
          const s = store.get("schedules", m[1]);
          send(res, {
            ...contextFor({
              prompt: s.prompt_template,
              memories: store.all("memories", s.project_id),
              run: s,
            }),
            argv: tierToArgs("mock", s),
            dates: nextDates(s.cron_expr, s.timezone),
            tier: s.tier,
          });
        } else send(res, engine.updateSchedule(m[1], b));
        return;
      }
      m = path.match(
        /^\/api\/runs\/([a-zA-Z0-9-]+)(?:\/(cancel|retry|promote|answer|cleanup))?$/,
      );
      if (m) {
        if (method === "GET" && !m[2]) {
          const run = store.get("runs", m[1]);
          send(res, { ...run, events: store.events(run.id) });
          return;
        }
        if (method === "POST") {
          const b = await body(req);
          let result;
          if (m[2] === "cancel") result = engine.cancel(m[1]);
          if (m[2] === "promote") result = engine.promote(m[1]);
          if (m[2] === "answer") result = engine.answer(m[1], b.answer);
          if (m[2] === "cleanup") result = engine.cleanup(m[1]);
          if (m[2] === "retry") {
            const r = store.get("runs", m[1]);
            result = engine.enqueue({
              task_id: r.task_id,
              schedule_id: r.schedule_id,
              trigger: "manual",
              retry_of_run_id: r.id,
            });
          }
          insist(result, "Unknown operation.", 404);
          send(res, result);
          return;
        }
      }
      m = path.match(
        /^\/api\/artifacts\/([a-zA-Z0-9-]+)(?:\/(download|star))?$/,
      );
      if (m) {
        const a = store.get("artifacts", m[1]);
        if (method === "GET") {
          const content = readSafe(resolve(store.dir, "artifacts"), a.path);
          if (m[2] === "download") {
            res.writeHead(200, {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": 'attachment; filename="output.md"',
            });
            res.end(content);
          } else send(res, { ...a, content: content.toString() });
          return;
        }
        if (method === "POST" && m[2] === "star") {
          send(res, store.put("artifacts", { ...a, starred: !a.starred }));
          return;
        }
      }
      m = path.match(/^\/api\/quotas\/([a-zA-Z0-9-]+)$/);
      if (m && method === "POST") {
        send(res, engine.quota(m[1], await body(req)));
        return;
      }
      m = path.match(/^\/api\/approvals\/([a-zA-Z0-9-]+)\/approve$/);
      if (m && method === "POST") {
        send(res, engine.approve(m[1], (await body(req)).content_hash));
        return;
      }
      throw new AppError("Not found.", 404);
    } catch (e) {
      if (!res.headersSent)
        send(
          res,
          {
            error:
              e instanceof AppError
                ? e.message
                : "The operation could not be completed. Check the input and try again.",
            code: e.code || "operation_failed",
          },
          e.status || 400,
        );
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 50;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  origin = `http://${host}:${server.address().port}`;
  if (startEngine) engine.start();
  log(`RunHarbor ${origin}`);
  if (setupToken) log(`First-run setup code: ${setupToken}`);
  return {
    server,
    store,
    engine,
    origin,
    setupToken,
    close: async () => {
      for (const s of streams) s.res.end();
      await engine.close();
      await new Promise((r) => server.close(r));
      store.close();
    },
  };
}
function joinWeb(name) {
  return resolve(web, name);
}
