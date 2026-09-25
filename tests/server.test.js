import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server.js";

async function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "rh-http-")),
    app = await createApp({
      dataDir: dir,
      port: 0,
      log: () => {},
      startEngine: false,
    });
  try {
    await fn(app);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
test("all APIs and SSE require authentication, health exposes no details", () =>
  fixture(async ({ origin }) => {
    for (const path of [
      "/api/state",
      "/api/events",
      "/api/audit",
      "/api/search?q=test",
    ])
      assert.equal((await fetch(origin + path)).status, 401);
    const r = await fetch(origin + "/healthz");
    assert.equal(await r.text(), "ok");
    assert(!r.headers.has("access-control-allow-origin"));
    assert(
      r.headers
        .get("content-security-policy")
        .includes("frame-ancestors 'none'"),
    );
  }));
test("setup is one-time, cookie is HttpOnly, CSRF and Origin are enforced, logout revokes access", () =>
  fixture(async ({ origin, setupToken }) => {
    const headers = { "Content-Type": "application/json", Origin: origin };
    const setup = await fetch(origin + "/auth/setup", {
      method: "POST",
      headers,
      body: JSON.stringify({
        setup_token: setupToken,
        password: "my local test password",
      }),
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get("set-cookie").split(";")[0],
      { csrf } = await setup.json();
    assert(setup.headers.get("set-cookie").includes("HttpOnly"));
    assert.equal(
      (
        await fetch(origin + "/auth/setup", {
          method: "POST",
          headers,
          body: JSON.stringify({
            setup_token: setupToken,
            password: "my local test password",
          }),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await fetch(origin + "/api/projects", {
          method: "POST",
          headers: { ...headers, Cookie: cookie },
          body: '{"name":"blocked"}',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(origin + "/api/projects", {
          method: "POST",
          headers: {
            ...headers,
            Cookie: cookie,
            "X-CSRF-Token": csrf,
            Origin: "https://evil.example",
          },
          body: '{"name":"blocked"}',
        })
      ).status,
      403,
    );
    const validHeaders = { ...headers, Cookie: cookie, "X-CSRF-Token": csrf };
    assert.equal(
      (
        await fetch(origin + "/api/projects", {
          method: "POST",
          headers: validHeaders,
          body: '{"name":"allowed"}',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await fetch(origin + "/api/logout", {
          method: "POST",
          headers: validHeaders,
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(origin + "/api/state", { headers: { Cookie: cookie } }))
        .status,
      401,
    );
  }));
test("first-run code cannot be fetched from the server", () =>
  fixture(async ({ origin, setupToken }) => {
    const status = await (await fetch(origin + "/auth/status")).text();
    assert(!status.includes(setupToken));
    const r = await fetch(origin + "/auth/setup", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        setup_token: "wrong",
        password: "my local test password",
      }),
    });
    assert.equal(r.status, 401);
  }));
test("non-loopback binds are rejected before creating a service", async () => {
  await assert.rejects(
    createApp({ dataDir: "/unused", host: "0.0.0.0" }),
    /Only 127/,
  );
});
test("login attempts are rate limited", () =>
  fixture(async ({ origin }) => {
    for (let i = 0; i < 10; i++) {
      const r = await fetch(origin + "/auth/setup", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: '{"setup_token":"wrong","password":"a long enough password"}',
      });
      assert.equal(r.status, 401);
    }
    assert.equal(
      (
        await fetch(origin + "/auth/setup", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      429,
    );
  }));
