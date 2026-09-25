import { chromium } from "@playwright/test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../src/server.js";

const dir = mkdtempSync(join(tmpdir(), "rh-browser-"));
const app = await createApp({
  dataDir: dir,
  port: 0,
  mockDelay: 50,
  log: () => {},
});
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
mkdirSync("docs/images", { recursive: true });
try {
  await page.goto(app.origin);
  await page.getByLabel("One-time setup code").fill(app.setupToken);
  await page.getByLabel("Create password").fill("browser test-only passphrase");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByRole("heading", { name: "Needs your attention" }).waitFor();
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.getByRole("button", { name: "Answer request" }).waitFor();
  await page.screenshot({
    path: "docs/images/inbox-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Answer request" }).click();
  await page
    .getByRole("button", { name: "Short overview", exact: true })
    .click();
  await page
    .locator("dialog")
    .getByRole("heading", { name: "Choose a release-note format", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("heading", { name: "Everything is in a good place." })
    .waitFor();
  await page.getByRole("link", { name: "Outputs", exact: true }).click();
  await page
    .getByRole("button", { name: "View output", exact: true })
    .first()
    .click();
  await page.getByText("Plain-text preview", { exact: true }).waitFor();
  assert(
    (await page.locator("dialog pre").textContent()).includes("Mock output"),
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: "docs/images/outputs-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Schedules", exact: true }).click();
  await page.getByRole("button", { name: "New schedule", exact: true }).click();
  await page
    .getByLabel("Schedule name", { exact: true })
    .fill("Browser regression schedule");
  await page.getByRole("button", { name: "Preview next 5 runs" }).click();
  await page.getByRole("button", { name: "Save schedule" }).click();
  await page
    .getByRole("heading", { name: "Browser regression schedule", exact: true })
    .waitFor();
  const card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Browser regression schedule",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await card.getByRole("button", { name: "Enable", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await card.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.screenshot({
    path: "docs/images/schedules-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Usage", exact: true }).click();
  await page.screenshot({
    path: "docs/images/usage-desktop.png",
    fullPage: true,
  });
  // Untrusted HTML stays as inert text in the browser.
  const project = app.store.all("projects")[0],
    task = app.engine.task({
      project_id: project.id,
      title: "Untrusted output regression",
      scenario: "hostile_output",
    });
  const run = app.engine.enqueue({ task_id: task.id });
  await app.engine.tick();
  await Promise.all([...app.engine.work]);
  await page.reload();
  await page.getByRole("link", { name: "Outputs", exact: true }).click();
  await page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Untrusted output regression",
        exact: true,
      }),
    })
    .getByRole("button", { name: "View output", exact: true })
    .click();
  assert.equal(await page.locator("dialog img").count(), 0);
  assert.equal(await page.locator("dialog script").count(), 0);
  assert(
    (await page.locator("dialog pre").textContent()).includes("<img src=x"),
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "inbox",
    "outputs",
    "projects",
    "tasks",
    "schedules",
    "usage",
    "security",
    "settings",
  ]) {
    await page.goto(`${app.origin}/#${route}`);
    await page.locator("main").waitFor();
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ))
    ) {
      console.log(
        await page.locator("body *").evaluateAll((nodes) =>
          nodes
            .filter((n) => n.getBoundingClientRect().right > innerWidth + 1)
            .map((n) => ({
              tag: n.tagName,
              cls: n.className,
              width: n.getBoundingClientRect().width,
            }))
            .slice(0, 20),
        ),
      );
      await page.screenshot({
        path: "test-results-overflow.png",
        fullPage: true,
      });
    }
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Horizontal overflow on ${route}`,
    );
  }
  await page.goto(`${app.origin}/#inbox`);
  await page.locator("main").waitFor();
  await page.screenshot({
    path: "docs/images/inbox-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Emergency stop", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page
    .getByText("Emergency stop is active. Runs and deliveries")
    .waitFor();
  assert(app.engine.stopped());
  assert.deepEqual(errors, []);
  console.log(
    "Browser passed: first-run setup, demo, input continuation, artifact preview, schedule creation/test/enable, inert hostile output, 8 routes at 390px, emergency stop, and no console errors.",
  );
} finally {
  await context.close();
  await browser.close();
  await app.close();
  rmSync(dir, { recursive: true, force: true });
}
