const root = document.querySelector("#app"),
  dialog = document.querySelector("#dialog"),
  toaster = document.querySelector("#toast");
let state,
  csrf,
  events,
  route = location.hash.slice(1) || "inbox",
  filter = "all",
  language = localStorage.getItem("language") || "en",
  selected = new Set(),
  refreshTimer;
const translations = {
  Inbox: "收件匣",
  Outputs: "成果",
  Projects: "專案",
  Tasks: "任務",
  Schedules: "排程",
  Usage: "額度與用量",
  Agents: "代理",
  Security: "安全狀態",
  Settings: "設定",
  Search: "搜尋",
  "New task": "新增任務",
  "New project": "新增專案",
  "New schedule": "新增排程",
  "Needs your attention": "需要你處理的事",
  "A calmer place for agent work.": "讓代理工作井然有序。",
  "Everything is in a good place.": "需要處理的事情都完成了。",
  "Create project": "建立專案",
  "Create task": "建立任務",
  "Save schedule": "儲存排程",
  Cancel: "取消",
  Unknown: "未知",
  "Emergency stop": "緊急停止",
  Pause: "暫停",
  Resume: "恢復",
  Running: "執行中",
  Mock: "模擬",
  "Try the demo": "試用示範",
  "Sign out": "登出",
  "View output": "查看成果",
  "View run": "查看執行紀錄",
  Dismiss: "忽略",
  Snooze: "稍後提醒",
  Resolve: "解決",
  Retry: "重試",
  "Local workbench": "本機工作台",
  "No model calls. No API keys.": "無模型呼叫，無需 API key。",
};
const t = (s) => (language === "zh-Hant" ? translations[s] || s : s);
const icons = {
  inbox: "▣",
  outputs: "▤",
  projects: "▦",
  tasks: "✓",
  schedules: "◷",
  usage: "◴",
  agents: "◇",
  security: "⬡",
  settings: "⚙",
  search: "⌕",
};
function h(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on"))
      n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") n.value = v;
    else if (k === "checked") n.checked = v;
    else if (k === "disabled") n.disabled = v;
    else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined && child !== false)
      n.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return n;
}
function button(label, fn, cls = "", props = {}) {
  return h(
    "button",
    {
      type: "button",
      class: cls,
      onClick: async (e) => {
        try {
          await fn(e);
        } catch (err) {
          toast(err.message);
        }
      },
      ...props,
    },
    t(label),
  );
}
function badge(label, color = "") {
  return h("span", { class: `badge ${color}` }, label);
}
function fmt(date) {
  return date
    ? new Intl.DateTimeFormat(language, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(date))
    : "—";
}
function age(date) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(date)) / 60000));
  return min < 1
    ? "just now"
    : min < 60
      ? `${min}m ago`
      : min < 1440
        ? `${Math.floor(min / 60)}h ago`
        : fmt(date);
}
function name(id) {
  return state?.projects.find((p) => p.id === id)?.name || "Project";
}
function statusBadge(s) {
  return badge(
    s.replaceAll("_", " "),
    ["succeeded", "done", "enabled"].includes(s)
      ? "green"
      : ["failed", "timed_out", "auto_paused", "interrupted"].includes(s)
        ? "red"
        : ["awaiting_input", "pending_approval", "deferred"].includes(s)
          ? "amber"
          : "",
  );
}
async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf || "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The local service did not return a valid response.");
  }
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/api/")) {
      events?.close();
      await boot();
    }
    throw new Error(data.error || "Request failed.");
  }
  return data;
}
function toast(message, undo) {
  toaster.replaceChildren(
    h("span", {}, message),
    undo ? button("Undo", undo, "small") : null,
  );
  toaster.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => toaster.classList.remove("show"),
    undo ? 10000 : 5000,
  );
}
function brand() {
  return h(
    "div",
    { class: "brand" },
    h("img", { src: "/logo.svg", alt: "" }),
    h("span", {}, "RunHarbor", h("span", {}, "THE AGENT WORKBENCH")),
  );
}
function modal(title, content) {
  dialog.replaceChildren(
    h(
      "div",
      { class: "dialoghead" },
      h(
        "div",
        {},
        h("div", { class: "eyebrow" }, "RUNHARBOR / WORKBENCH"),
        h("h2", {}, t(title)),
      ),
      button("×", () => dialog.close(), "ghost", {
        "aria-label": "Close dialog",
      }),
    ),
    content,
  );
  if (!dialog.open) dialog.showModal();
}
async function confirmAction(title, description, action) {
  modal(
    title,
    h(
      "div",
      {},
      h("p", {}, description),
      h(
        "div",
        { class: "formfooter" },
        button("Cancel", () => dialog.close()),
        button(
          "Confirm",
          async () => {
            await action();
            dialog.close();
            await refresh();
          },
          "primary",
        ),
      ),
    ),
  );
}
function field(label, name, type = "text", value = "", extra = {}) {
  const control =
    type === "textarea"
      ? h("textarea", { name, ...extra }, value)
      : type === "select"
        ? h(
            "select",
            { name, ...extra },
            value.map((v) =>
              h(
                "option",
                {
                  value: typeof v === "string" ? v : v.value,
                  selected: v.selected,
                },
                typeof v === "string" ? v : v.label,
              ),
            ),
          )
        : h("input", { name, type, value, ...extra });
  return h(
    "label",
    { class: `field ${extra.full ? "full" : ""}` },
    label,
    control,
  );
}
function form(title, fields, submit, label) {
  const error = h("div", { class: "error", role: "alert" });
  const f = h(
    "form",
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const b = f.querySelector("button[type=submit]");
        b.disabled = true;
        try {
          await submit(Object.fromEntries(new FormData(f)));
          dialog.close();
          await refresh();
        } catch (err) {
          error.textContent = err.message;
        } finally {
          b.disabled = false;
        }
      },
    },
    h("div", { class: "formgrid" }, fields),
    error,
    h(
      "div",
      { class: "formfooter" },
      button("Cancel", () => dialog.close()),
      h("button", { type: "submit", class: "primary" }, t(label)),
    ),
  );
  modal(title, f);
}
async function refresh() {
  state = await api("/api/state");
  render();
}
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(() => {}), 200);
}
function nav(id) {
  location.hash = id;
  if (route === id) render();
}
function heading(eyebrow, title, description, actions = []) {
  return h(
    "div",
    { class: "heading" },
    h(
      "div",
      {},
      h("div", { class: "eyebrow" }, eyebrow),
      h("h1", {}, t(title)),
      h("p", {}, description),
    ),
    h("div", { class: "actions" }, actions),
  );
}
function empty(title, description, actions = []) {
  return h(
    "div",
    { class: "empty" },
    h("div", { class: "emptyicon" }, "✓"),
    h("h2", {}, t(title)),
    h("p", {}, description),
    h("div", { class: "actions" }, actions),
  );
}
function stats() {
  const runs = state.runs.filter((r) => !r.is_test),
    today = new Date().toISOString().slice(0, 10);
  return h(
    "div",
    { class: "stats" },
    [
      [
        "Needs attention",
        state.inbox.filter((i) => i.state === "open").length,
        "Exceptions, not every update",
        "lime",
      ],
      [
        "Outputs today",
        state.artifacts.filter(
          (a) => !a.is_test && a.created_at.startsWith(today),
        ).length,
        "Mock results included",
      ],
      [
        "Active runs",
        runs.filter((r) => ["pending", "running"].includes(r.status)).length,
        "4 concurrent slots",
      ],
      ["AI tokens used", t("Unknown"), "Mock runs use no model tokens"],
    ].map(([label, value, hint, color]) =>
      h(
        "div",
        { class: "stat" },
        h("span", { class: "label" }, label),
        h("span", { class: `value ${color || ""}` }, value),
        h("span", { class: "hint" }, hint),
      ),
    ),
  );
}
function render() {
  if (!state) return;
  document.documentElement.lang = language;
  document.body.classList.toggle(
    "light",
    localStorage.getItem("theme") === "light",
  );
  const attention = state.inbox.filter((i) => i.state === "open").length;
  const navlink = (id) =>
    h(
      "a",
      { href: `#${id}`, class: route === id ? "active" : "" },
      h("span", { "aria-hidden": "true" }, icons[id]),
      t(id[0].toUpperCase() + id.slice(1)),
      id === "inbox" && attention
        ? h("span", { class: "count" }, attention)
        : null,
    );
  const sidebar = h(
    "aside",
    { class: "sidebar" },
    brand(),
    h(
      "nav",
      { class: "nav", "aria-label": "Main navigation" },
      ["inbox", "outputs", "projects", "tasks", "schedules", "usage"].map(
        navlink,
      ),
    ),
    h("div", { class: "navlabel" }, "WORKSPACE"),
    h(
      "nav",
      { class: "nav secondary", "aria-label": "Workspace navigation" },
      ["agents", "security", "settings"].map(navlink),
    ),
    h(
      "div",
      { class: "sidebottom" },
      h(
        "p",
        {},
        h("span", { class: "dot" }),
        "Local by design",
        h("br"),
        "Your work stays on this machine.",
      ),
      badge("DEVELOPMENT · MOCK ONLY"),
      h("p", {}, "v0.1.0-alpha.1"),
    ),
  );
  const top = h(
    "header",
    { class: "topbar" },
    h(
      "div",
      { class: "breadcrumb" },
      "Workspace",
      " / ",
      h("strong", {}, t(route[0].toUpperCase() + route.slice(1))),
    ),
    button("Search", () => nav("search"), "topsearch"),
    h(
      "div",
      { class: "right" },
      badge(
        state.status.stopped
          ? "STOPPED"
          : state.status.paused
            ? "PAUSED"
            : "LOCAL",
        state.status.stopped ? "red" : "green",
      ),
      button(
        state.status.paused ? "Resume" : "Pause",
        () =>
          state.status.stopped
            ? confirmAction(
                "Resume work",
                "Resuming permits queued work to start. Failover remains disabled after an emergency stop.",
                () => api("/api/resume", { confirmed: true }),
              )
            : api("/api/pause", { paused: !state.status.paused }).then(refresh),
        "small ghost",
      ),
      button(
        "Emergency stop",
        () =>
          confirmAction(
            "Emergency stop",
            "Cancel active and queued runs, pause scheduling, expire pending approvals, and disable automatic switching.",
            () => api("/api/stop", {}),
          ),
        "small danger",
      ),
      button(
        language === "en" ? "繁中" : "EN",
        () => {
          language = language === "en" ? "zh-Hant" : "en";
          localStorage.setItem("language", language);
          render();
        },
        "small ghost",
      ),
    ),
  );
  const views = {
    inbox: inboxView,
    outputs: outputsView,
    projects: projectsView,
    tasks: tasksView,
    schedules: schedulesView,
    usage: usageView,
    agents: agentsView,
    security: securityView,
    settings: settingsView,
    search: searchView,
  };
  const content = h(
    "main",
    { class: "content", id: "main" },
    state.status.stopped
      ? h(
          "div",
          { class: "banner danger" },
          "Emergency stop is active. Runs and deliveries are blocked until you resume.",
        )
      : null,
    (views[route] || inboxView)(),
    h(
      "footer",
      { class: "footer" },
      h("span", {}, "RUNHARBOR · YOUR AGENTS, A LITTLE MORE ORGANIZED."),
      h(
        "span",
        {},
        "Development preview · Live adapters blocked pending verification",
      ),
    ),
  );
  root.replaceChildren(
    h(
      "div",
      { class: "shell" },
      sidebar,
      h("div", { class: "main" }, top, content),
    ),
  );
}
function inboxView() {
  const open = state.inbox
    .filter(
      (i) =>
        i.state === "open" || (filter === "snoozed" && i.state === "snoozed"),
    )
    .sort(
      (a, b) =>
        ({ critical: 0, action: 1, warning: 2, info: 3 })[a.severity] -
          { critical: 0, action: 1, warning: 2, info: 3 }[b.severity] ||
        b.updated_at.localeCompare(a.updated_at),
    );
  const filtered = open.filter(
    (i) =>
      filter === "all" ||
      (filter === "snoozed" && i.state === "snoozed") ||
      (filter === "input" && i.type === "input_needed") ||
      (filter === "failure" &&
        ["run_failed", "schedule_paused", "security_alert"].includes(i.type)) ||
      (filter === "quota" && /quota|failover/.test(i.type)) ||
      (filter === "review" && i.type === "delivery_pending"),
  );
  return h(
    "div",
    {},
    heading(
      "YOUR WORK, UNDER CONTROL",
      "Needs your attention",
      language === "zh-Hant"
        ? "成功成果集中保存，收件匣只保留需要你處理的例外。"
        : "Good work carries on. This is where you come in.",
      [button("+ New task".replace("+ ", ""), newTask, "primary")],
    ),
    h(
      "div",
      { class: "banner" },
      "Mock workspace · Explore the complete local workflow without an account, API key, or model spend. Live-agent execution is currently blocked.",
    ),
    stats(),
    h(
      "div",
      { class: "grid" },
      h(
        "section",
        {},
        h(
          "div",
          { class: "sectionbar" },
          h("h2", {}, t("Inbox")),
          h("span", { class: "muted" }, `${open.length} open`),
        ),
        h(
          "div",
          { class: "tabs" },
          [
            ["all", "All items"],
            ["review", "Review"],
            ["input", "Needs input"],
            ["failure", "Failures"],
            ["quota", "Quota"],
            ["snoozed", "Snoozed"],
          ].map(([id, label]) =>
            button(
              label,
              () => {
                filter = id;
                render();
              },
              filter === id ? "active" : "",
            ),
          ),
        ),
        selected.size
          ? h(
              "div",
              { class: "actions" },
              badge(`${selected.size} selected`),
              ...["dismiss", "snooze", "resolve"].map((a) =>
                button(a, () => batch([...selected], a), "small"),
              ),
            )
          : null,
        filtered.length
          ? filtered.map(inboxCard)
          : empty(
              "Everything is in a good place.",
              state.projects.length
                ? "Routine results are waiting in Outputs. Your inbox fills only when something needs a decision."
                : "Start with a sample workspace, then try your own tasks and schedules.",
              [
                button(
                  state.projects.length ? "View outputs" : "Try the demo",
                  () =>
                    state.projects.length
                      ? nav("outputs")
                      : api("/api/demo", {}).then(refresh),
                  "primary",
                ),
                button("New project", newProject, "ghost"),
              ],
            ),
      ),
      h(
        "aside",
        { class: "aside" },
        quotaPanel(),
        h(
          "div",
          { class: "card" },
          h("div", { class: "paneltitle" }, "RECENT ACTIVITY"),
          state.runs.length
            ? state.runs.slice(0, 5).map((r) =>
                h(
                  "div",
                  { class: "activity" },
                  h(
                    "div",
                    { class: "circle" },
                    r.status === "succeeded" ? "✓" : "·",
                  ),
                  h(
                    "div",
                    {},
                    h(
                      "p",
                      {},
                      button(r.title, () => runDetail(r.id), "linkbutton"),
                    ),
                    h(
                      "small",
                      {},
                      `${r.status.replaceAll("_", " ")} · ${age(r.updated_at)}`,
                    ),
                  ),
                ),
              )
            : h("p", {}, "Your first run will appear here."),
        ),
        h(
          "div",
          { class: "card" },
          h("div", { class: "paneltitle" }, "A QUIETER WORKFLOW"),
          h("h3", {}, "Runs, without the chat clutter."),
          h(
            "p",
            {},
            "Schedules keep their own history. Routine successes go to Outputs. Exceptions find you here.",
          ),
          button("Explore schedules →", () => nav("schedules"), "linkbutton"),
        ),
      ),
    ),
  );
}
function inboxCard(i) {
  const r = state.runs.find((r) => r.id === i.ref_id);
  return h(
    "article",
    { class: `card exception ${i.severity}` },
    h(
      "div",
      { class: "cardtop" },
      h(
        "div",
        { class: "badges" },
        h("input", {
          type: "checkbox",
          "aria-label": `Select ${i.title}`,
          checked: selected.has(i.id),
          onChange: (e) => {
            e.target.checked ? selected.add(i.id) : selected.delete(i.id);
            render();
          },
        }),
        badge(
          i.type.replaceAll("_", " "),
          i.severity === "critical"
            ? "red"
            : i.severity === "action"
              ? "amber"
              : "",
        ),
        badge(name(i.project_id)),
        i.occurrence_count > 1 ? badge(`×${i.occurrence_count}`) : null,
      ),
      h("span", { class: "muted" }, age(i.updated_at)),
    ),
    h("h3", {}, i.title),
    h("p", {}, i.body),
    r?.summary ? summaryLines(r.summary) : null,
    h(
      "div",
      { class: "cardbottom" },
      h(
        "div",
        { class: "meta" },
        badge("MOCK"),
        r ? badge(`T${r.tier}`) : null,
        r?.tainted ? badge("Untrusted data", "amber") : null,
      ),
      h(
        "div",
        { class: "actions" },
        i.type === "input_needed"
          ? button("Answer request", () => answerDialog(i, r), "primary small")
          : i.approval_id
            ? button(
                "Review delivery",
                () => approvalDialog(i.approval_id),
                "primary small",
              )
            : button("View run", () => runDetail(i.ref_id), "small"),
        button("Snooze", () => batch([i.id], "snooze"), "small ghost"),
        button("Dismiss", () => batch([i.id], "dismiss"), "small ghost"),
      ),
    ),
  );
}
function summaryLines(s) {
  return h(
    "div",
    { class: "summarylines" },
    ["did", "result", "next"].map((k) =>
      h("div", { class: "summaryline" }, h("span", {}, k), h("span", {}, s[k])),
    ),
  );
}
async function batch(ids, action) {
  const r = await api("/api/inbox/batch", { ids, action });
  selected.clear();
  await refresh();
  toast("Inbox updated.", async () => {
    await api("/api/inbox/undo", { id: r.undo_id });
    await refresh();
    toast("Restored.");
  });
}
function quotaPanel() {
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "sectionbar" },
      h("div", { class: "paneltitle" }, "AGENT CAPACITY"),
      button("View all", () => nav("usage"), "linkbutton"),
    ),
    ["codex", "claude"].map((id) => {
      const p = state.profiles.find((p) => p.id === id);
      return h(
        "div",
        { class: "quota" },
        h(
          "div",
          { class: "quotatitle" },
          h("span", {}, p.name),
          h(
            "span",
            {
              class: "muted",
              title: "No verified live quota source connected.",
            },
            t("Unknown"),
          ),
        ),
        h("div", { class: "track unknown" }),
        h("div", { class: "help" }, "Not connected · no live quota source"),
      );
    }),
    h(
      "div",
      { class: "notice" },
      "Unknown is not zero. Every quota number keeps its source and confidence.",
    ),
  );
}
function newProject() {
  form(
    "New project",
    [
      field("Project name", "name", "text", "", {
        required: true,
        maxlength: 100,
      }),
      field("Description", "description", "textarea", "", { full: true }),
    ],
    (b) => api("/api/projects", b),
    "Create project",
  );
}
function projectOptions() {
  return state.projects
    .filter((p) => !p.archived)
    .map((p) => ({ value: p.id, label: p.name }));
}
function newTask() {
  if (!projectOptions().length) {
    newProject();
    return;
  }
  form(
    "New task",
    [
      field("Project", "project_id", "select", projectOptions()),
      field("Title", "title", "text", "", { required: true, maxlength: 160 }),
      field("What should this run do?", "description", "textarea", "", {
        required: true,
        full: true,
      }),
      field("Mock scenario", "scenario", "select", [
        "success",
        "notable",
        "needs_input",
        "timeout_twice",
        "quota",
        "crash",
        "stall",
        "hostile_output",
      ]),
      field("Execution profile", "profile_id", "select", [
        { value: "mock-primary", label: "Mock · primary" },
        { value: "mock-backup", label: "Mock · backup" },
      ]),
      h(
        "div",
        { class: "notice wide" },
        "This build executes scripted mock scenarios. It does not call a model or run your prompt as a command.",
      ),
    ],
    (b) => api("/api/tasks", { ...b, run: true }),
    "Create and run",
  );
}
function newSchedule() {
  if (!projectOptions().length) {
    newProject();
    return;
  }
  const preview = h("div", { class: "help wide" });
  form(
    "New schedule",
    [
      field("Project", "project_id", "select", projectOptions()),
      field("Schedule name", "name", "text", "", { required: true }),
      field(
        "Prompt template",
        "prompt_template",
        "textarea",
        "Prepare a project digest for {{date}}.\n{{project_memory}}",
        { full: true, required: true },
      ),
      field(
        "Cron · minute hour day month weekday",
        "cron_expr",
        "text",
        "0 8 * * 1-5",
        { required: true },
      ),
      field(
        "Timezone",
        "timezone",
        "text",
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        { required: true },
      ),
      field("Scenario", "scenario", "select", [
        "success",
        "notable",
        "needs_input",
        "timeout_twice",
        "quota",
        "crash",
      ]),
      field("When already running", "concurrency_policy", "select", [
        "skip_if_running",
        "queue",
        "allow_parallel",
      ]),
      field("After missed triggers", "catch_up_policy", "select", [
        "run_once",
        "skip",
        "run_all",
      ]),
      field("Notify", "notify_policy", "select", [
        "on_failure",
        "on_change",
        "always",
        "never",
      ]),
      preview,
      button(
        "Preview next 5 runs",
        async () => {
          const b = Object.fromEntries(
            new FormData(dialog.querySelector("form")),
          );
          const r = await api("/api/cron-preview", b);
          preview.replaceChildren(
            ...r.dates.map((d) =>
              h("div", {}, `${fmt(d)} · ${new Date(d).toISOString()}`),
            ),
          );
        },
        "ghost small",
      ),
      h(
        "div",
        { class: "notice wide" },
        "Created paused. Test it first, then explicitly enable automatic runs. T2 · no network · artifact-only workspace.",
      ),
    ],
    (b) => api("/api/schedules", b),
    "Save schedule",
  );
}
function tasksView() {
  return h(
    "div",
    {},
    heading(
      "ONE PLACE FOR EACH PIECE OF WORK",
      "Tasks",
      "A task keeps its runs and follow-up requests together.",
      [button("New task", newTask, "primary")],
    ),
    state.tasks.length
      ? h(
          "div",
          { class: "tablewrap" },
          h(
            "table",
            {},
            h(
              "thead",
              {},
              h(
                "tr",
                {},
                ["Task", "Status", "Agent", "Updated", ""].map((c) =>
                  h("th", {}, c),
                ),
              ),
            ),
            h(
              "tbody",
              {},
              state.tasks.map((task) =>
                h(
                  "tr",
                  {},
                  h(
                    "td",
                    { class: "title" },
                    h("strong", {}, task.title),
                    h("small", {}, name(task.project_id)),
                  ),
                  h("td", {}, statusBadge(task.status)),
                  h("td", {}, badge("MOCK"), ` T${task.tier}`),
                  h("td", {}, age(task.updated_at)),
                  h(
                    "td",
                    {},
                    h(
                      "div",
                      { class: "actions" },
                      button("History", () => taskDetail(task), "small"),
                      button(
                        "Run",
                        async () => {
                          await api(`/api/tasks/${task.id}/run`, {});
                          await refresh();
                        },
                        "small ghost",
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        )
      : empty(
          "No tasks yet.",
          "Create a task or explore the sample workspace.",
          [button("New task", newTask, "primary")],
        ),
  );
}
function taskDetail(task) {
  const runs = state.runs.filter((r) => r.task_id === task.id);
  modal(
    task.title,
    h(
      "div",
      { class: "detail" },
      h("p", {}, task.description),
      statusBadge(task.status),
      ...runs.map((r) =>
        h(
          "div",
          { class: "card" },
          h(
            "div",
            { class: "cardtop" },
            statusBadge(r.status),
            badge(`Attempt ${r.attempt}`),
          ),
          r.summary ? summaryLines(r.summary) : h("p", {}, "Run is pending."),
          button("View run", () => runDetail(r.id), "small"),
        ),
      ),
    ),
  );
}
function schedulesView() {
  return h(
    "div",
    {},
    heading(
      "AUTOMATION, WITHOUT THE CLUTTER",
      "Schedules",
      "Each trigger creates a run. Your task and chat lists stay quiet.",
      [button("New schedule", newSchedule, "primary")],
    ),
    state.schedules.filter((s) => s.status !== "deleted").length
      ? h(
          "div",
          { class: "cards" },
          state.schedules
            .filter((s) => s.status !== "deleted")
            .map((s) =>
              h(
                "article",
                { class: "card" },
                h(
                  "div",
                  { class: "cardtop" },
                  badge(name(s.project_id)),
                  statusBadge(s.status),
                ),
                h("h2", {}, s.name),
                h("div", { class: "schedulecron" }, s.cron_expr),
                h("div", { class: "help" }, s.timezone),
                h(
                  "p",
                  {},
                  `Next: ${s.status === "enabled" ? fmt(s.next_run_at) : "Paused until you enable it"}`,
                ),
                h(
                  "div",
                  { class: "badges" },
                  badge("MOCK"),
                  badge(`T${s.tier}`),
                  badge(`v${s.version}`),
                  badge(
                    `${state.runs.filter((r) => r.schedule_id === s.id).length} runs`,
                  ),
                ),
                h(
                  "div",
                  { class: "cardbottom" },
                  h(
                    "div",
                    { class: "actions" },
                    button(
                      "Test",
                      async () => {
                        const r = await api(`/api/schedules/${s.id}/run`, {
                          is_test: true,
                        });
                        await refresh();
                        await runDetail(r.id);
                      },
                      "small",
                    ),
                    button(
                      "Run now",
                      async () => {
                        await api(`/api/schedules/${s.id}/run`, {});
                        await refresh();
                      },
                      "small",
                    ),
                    button("Details", () => scheduleDetail(s), "small ghost"),
                  ),
                  button(
                    s.status === "enabled" ? "Pause" : "Enable",
                    () =>
                      s.status === "enabled"
                        ? api(`/api/schedules/${s.id}/state`, {
                            status: "paused",
                          }).then(refresh)
                        : confirmAction(
                            "Enable schedule",
                            `${s.name} will run automatically at ${s.cron_expr} in ${s.timezone}. Mock execution only; no model spend.`,
                            () =>
                              api(`/api/schedules/${s.id}/state`, {
                                status: "enabled",
                                confirmed: true,
                              }),
                          ),
                    "small primary",
                  ),
                ),
              ),
            ),
        )
      : empty(
          "Make good work repeatable.",
          "Create a schedule, preview the prompt and times, test it, and then enable it.",
          [button("New schedule", newSchedule, "primary")],
        ),
  );
}
async function scheduleDetail(s) {
  const preview = await api(`/api/schedules/${s.id}/preview`, {});
  modal(
    s.name,
    h(
      "div",
      { class: "detail" },
      h(
        "div",
        { class: "badges" },
        statusBadge(s.status),
        badge(`Version ${s.version}`),
        badge(`T${s.tier}`),
      ),
      h(
        "div",
        { class: "split" },
        h(
          "div",
          {},
          h("h3", {}, "Next five triggers"),
          ...preview.dates.map((d) => h("p", {}, fmt(d))),
        ),
        h(
          "div",
          {},
          h("h3", {}, "Execution policy"),
          h("p", {}, `${s.concurrency_policy} · ${s.catch_up_policy}`),
          h(
            "p",
            {},
            `${s.max_retries} retries · ${s.budget_daily_runs} runs/day`,
          ),
        ),
      ),
      h("h3", {}, "Expanded prompt · preview only"),
      h("pre", {}, preview.prompt),
      h("h3", {}, "Recent runs"),
      state.runs
        .filter((r) => r.schedule_id === s.id)
        .map((r) =>
          h(
            "div",
            { class: "sectionbar" },
            statusBadge(r.status),
            h("span", {}, fmt(r.created_at)),
            button("View run", () => runDetail(r.id), "small"),
          ),
        ),
      h(
        "div",
        { class: "actions" },
        button("Edit", () => editSchedule(s)),
        button("Set delivery folder", () => deliveryFolder(s)),
        button(
          "Delete",
          () =>
            confirmAction(
              "Delete schedule",
              "The schedule will stop. Historical runs and outputs will remain.",
              () => api(`/api/schedules/${s.id}/state`, { status: "deleted" }),
            ),
          "danger",
        ),
      ),
    ),
  );
}
function editSchedule(s) {
  form(
    "Edit schedule",
    [
      field("Name", "name", "text", s.name, { required: true }),
      field("Cron expression", "cron_expr", "text", s.cron_expr, {
        required: true,
      }),
      field("Timezone", "timezone", "text", s.timezone, { required: true }),
      field(
        "Scenario",
        "scenario",
        "select",
        [
          "success",
          "notable",
          "needs_input",
          "timeout_twice",
          "quota",
          "crash",
        ].map((v) => ({ value: v, label: v, selected: v === s.scenario })),
      ),
      field("Prompt", "prompt_template", "textarea", s.prompt_template, {
        full: true,
        required: true,
      }),
    ],
    (b) => api(`/api/schedules/${s.id}`, b),
    "Save version",
  );
}
function outputsView() {
  const artifacts = state.artifacts.filter((a) => !a.archived && !a.is_test);
  return h(
    "div",
    {},
    heading(
      "THE WORK THAT GOT DONE",
      "Outputs",
      "Every result has a home. Open it, keep it, or trace it back to its run.",
    ),
    artifacts.length
      ? h(
          "div",
          { class: "cards" },
          artifacts.map((a) => {
            const r = state.runs.find((r) => r.id === a.run_id);
            return h(
              "article",
              { class: "card" },
              h(
                "div",
                { class: "cardtop" },
                h(
                  "div",
                  { class: "badges" },
                  badge("MARKDOWN", "green"),
                  badge("MOCK"),
                  a.tainted ? badge("Untrusted", "amber") : null,
                ),
                button(
                  a.starred ? "★" : "☆",
                  async () => {
                    await api(`/api/artifacts/${a.id}/star`, {});
                    await refresh();
                  },
                  "small ghost",
                  { "aria-label": a.starred ? "Unstar output" : "Star output" },
                ),
              ),
              h("h2", {}, a.title),
              h(
                "div",
                { class: "outputpreview" },
                `# ${a.title}\n\n${r?.summary?.did || ""}\n${r?.summary?.result || ""}\n\n→ ${r?.summary?.next || "Open the result to read more."}`,
              ),
              h(
                "div",
                { class: "meta" },
                name(a.project_id),
                "·",
                fmt(a.created_at),
                "·",
                `${a.bytes.toLocaleString()} bytes`,
              ),
              h(
                "div",
                { class: "cardbottom" },
                button("View run", () => runDetail(a.run_id), "small ghost"),
                button(
                  "View output",
                  () => outputDetail(a.id),
                  "small primary",
                ),
              ),
            );
          }),
        )
      : empty(
          "Your next result starts here.",
          "Run a mock task or schedule. Successful outputs appear here automatically.",
          [button("New task", newTask, "primary")],
        ),
  );
}
async function outputDetail(id) {
  const a = await api(`/api/artifacts/${id}`);
  modal(
    a.title,
    h(
      "div",
      { class: "detail" },
      h(
        "div",
        { class: "badges" },
        badge("MOCK"),
        badge("Plain-text preview"),
        a.tainted ? badge("Untrusted data", "amber") : null,
      ),
      h("pre", {}, a.content),
      h(
        "div",
        { class: "actions" },
        h(
          "a",
          { href: `/api/artifacts/${id}/download`, download: "output.md" },
          "Download Markdown ↓",
        ),
        button(
          "Copy",
          async () => {
            await navigator.clipboard.writeText(a.content);
            toast("Copied.");
          },
          "small ghost",
        ),
        button("View run", () => runDetail(a.run_id), "small"),
      ),
      h("small", {}, `SHA-256 · ${a.sha256}`),
    ),
  );
}
async function runDetail(id) {
  const r = await api(`/api/runs/${id}`);
  modal(
    r.title,
    h(
      "div",
      { class: "detail" },
      h(
        "div",
        { class: "badges" },
        statusBadge(r.status),
        badge("MOCK"),
        badge(`T${r.tier}`),
        r.is_test ? badge("TEST · excluded from stats", "blue") : null,
        r.tainted ? badge("Untrusted data", "amber") : null,
      ),
      h(
        "div",
        { class: "kv" },
        [
          ["Run ID", r.id],
          ["Trigger", r.trigger],
          ["Attempt", r.attempt],
          ["Started", fmt(r.started_at)],
          ["Tokens", t("Unknown")],
          ["Cost", t("Unknown")],
        ].map(([label, value]) =>
          h(
            "div",
            {},
            h("span", { class: "label" }, label),
            h("span", {}, value),
          ),
        ),
      ),
      r.summary
        ? summaryLines(r.summary)
        : h("p", {}, "This run has not completed yet."),
      r.failover_from_run_id
        ? h(
            "div",
            { class: "notice" },
            "Switched from a previous run. ",
            button(
              "Open original",
              () => runDetail(r.failover_from_run_id),
              "linkbutton",
            ),
          )
        : null,
      h(
        "div",
        { class: "actions" },
        r.output_ref
          ? button("View output", () => outputDetail(r.output_ref), "primary")
          : null,
        ["pending", "running", "deferred"].includes(r.status)
          ? button(
              "Stop run",
              async () => {
                await api(`/api/runs/${id}/cancel`, {});
                await refresh();
                await runDetail(id);
              },
              "danger",
            )
          : button("Retry", async () => {
              const next = await api(`/api/runs/${id}/retry`, {});
              await refresh();
              await runDetail(next.id);
            }),
        r.schedule_id
          ? button("Promote to task", async () => {
              await api(`/api/runs/${id}/promote`, {});
              dialog.close();
              await refresh();
              nav("tasks");
            })
          : null,
      ),
      h(
        "details",
        {},
        h("summary", {}, "Prompt and context sources"),
        h("pre", {}, r.prompt_final || "Not yet prepared."),
        h("pre", {}, JSON.stringify(r.context_sources || [], null, 2)),
      ),
      h(
        "details",
        { open: true },
        h("summary", {}, "Event log"),
        h(
          "pre",
          { id: "runlog", "data-run-id": r.id },
          r.events
            .map(
              (e) =>
                `${e.ts}  ${e.type}\n${typeof e.payload.text === "string" ? e.payload.text : JSON.stringify(e.payload)}\n`,
            )
            .join("\n") || "No events yet.",
        ),
      ),
      h(
        "details",
        {},
        h("summary", {}, "Execution evidence"),
        h(
          "pre",
          {},
          JSON.stringify(
            {
              argv: r.argv_redacted,
              sandbox_hash: r.sandbox_config_hash,
              agent_version: r.agent_version,
            },
            null,
            2,
          ),
        ),
      ),
      h(
        "div",
        { class: "actions" },
        button("Refresh details", () => runDetail(id), "small ghost"),
        [
          "succeeded",
          "failed",
          "cancelled",
          "timed_out",
          "interrupted",
          "skipped",
        ].includes(r.status)
          ? button(
              "Clean workspace",
              async () => {
                await api(`/api/runs/${id}/cleanup`, {});
                toast("Workspace cleaned. The output is retained.");
              },
              "small ghost",
            )
          : null,
      ),
    ),
  );
}
function answerDialog(i, r) {
  modal(
    "Answer request",
    h(
      "div",
      {},
      h("p", {}, i.body),
      h(
        "div",
        { class: "actions" },
        (i.options || []).map((option) =>
          button(
            option,
            async () => {
              const next = await api(`/api/runs/${r.id}/answer`, {
                answer: option,
              });
              await refresh();
              await runDetail(next.id);
            },
            "primary",
          ),
        ),
      ),
    ),
  );
}
function projectsView() {
  return h(
    "div",
    {},
    heading(
      "A HOME FOR LONGER-TERM WORK",
      "Projects",
      "Keep tasks, schedules, outputs, and approved memory together.",
      [button("New project", newProject, "primary")],
    ),
    state.projects.length
      ? h(
          "div",
          { class: "cards" },
          state.projects.map((p) =>
            h(
              "article",
              { class: "card" },
              h(
                "div",
                { class: "cardtop" },
                badge("LOCAL WORKSPACE", "green"),
                p.archived ? badge("Archived") : badge(`T${p.default_tier}`),
              ),
              h("h2", {}, p.name),
              h(
                "p",
                {},
                p.description || "A place to organize your agent work.",
              ),
              h(
                "div",
                { class: "badges" },
                badge(
                  `${state.tasks.filter((x) => x.project_id === p.id).length} tasks`,
                ),
                badge(
                  `${state.schedules.filter((x) => x.project_id === p.id && x.status === "enabled").length} active schedules`,
                ),
                badge(
                  `${state.artifacts.filter((x) => x.project_id === p.id).length} outputs`,
                ),
              ),
              h(
                "div",
                { class: "cardbottom" },
                h(
                  "span",
                  { class: "help" },
                  p.failover_policy.enabled
                    ? "Mock fallback enabled"
                    : "Automatic switching off",
                ),
                button("Open project", () => projectDetail(p), "small primary"),
              ),
            ),
          ),
        )
      : empty(
          "Give your work a home.",
          "Create your first project or try the mock workspace.",
          [
            button("New project", newProject, "primary"),
            button("Try the demo", () => api("/api/demo", {}).then(refresh)),
          ],
        ),
  );
}
function projectDetail(p) {
  modal(
    p.name,
    h(
      "div",
      { class: "detail" },
      h("p", {}, p.description),
      h(
        "div",
        { class: "badges" },
        badge(`T${p.default_tier}`),
        badge("Approved: local mock only"),
        badge("Auto-merge off"),
      ),
      h("h3", {}, "Approved project memory"),
      state.memories
        .filter((m) => m.project_id === p.id)
        .map((m) =>
          h("div", { class: "card" }, badge(m.kind), h("p", {}, m.content)),
        ),
      h(
        "div",
        { class: "actions" },
        button("Add memory", () =>
          form(
            "Add project memory",
            [
              field("Kind", "kind", "select", [
                "note",
                "fact",
                "decision",
                "glossary",
              ]),
              field("Content", "content", "textarea", "", {
                required: true,
                full: true,
              }),
            ],
            (b) => api(`/api/projects/${p.id}/memory`, b),
            "Save memory",
          ),
        ),
        button("Configure fallback", () =>
          confirmAction(
            "Configure mock fallback",
            "Enable primary → backup switching for this project. Both profiles run locally, with the same permissions. Paid fallback is unavailable.",
            () =>
              api(`/api/projects/${p.id}/failover`, {
                confirmed: true,
                ordered_profile_ids: ["mock-primary", "mock-backup"],
                enabled: !p.failover_policy.enabled,
              }),
          ),
        ),
        button(
          p.archived ? "Restore project" : "Archive project",
          () =>
            confirmAction(
              p.archived ? "Restore project" : "Archive project",
              p.archived
                ? "Restore this project. Its schedules will remain paused."
                : "Pause this project’s schedules and cancel active runs. All history and outputs are retained.",
              () =>
                api(`/api/projects/${p.id}/archive`, { archived: !p.archived }),
            ),
          "danger",
        ),
      ),
    ),
  );
}
function usageView() {
  return h(
    "div",
    {},
    heading(
      "KNOW WHAT YOU KNOW",
      "Usage",
      "Quota, provenance, and switching decisions. Missing numbers stay unknown.",
    ),
    h(
      "div",
      { class: "cards" },
      state.profiles.map((p) => {
        const q = state.quotas.find((q) => q.profile_id === p.id);
        return h(
          "div",
          { class: "card" },
          h(
            "div",
            { class: "cardtop" },
            h("h3", {}, p.name),
            badge(
              p.agent_id === "mock" ? "SIMULATED" : "NOT CONNECTED",
              p.agent_id === "mock" ? "blue" : "",
            ),
          ),
          h("h1", {}, q?.used_pct == null ? t("Unknown") : `${q.used_pct}%`),
          h("div", { class: "track unknown" }),
          h(
            "p",
            {},
            q
              ? `Source: ${q.source} · Confidence: ${q.confidence}${q.anomalous ? " · ANOMALOUS — not used for decisions" : ""}`
              : "No verified quota source. No remaining allowance is assumed.",
          ),
          h(
            "div",
            { class: "meta" },
            "Reset: ",
            q?.resets_at ? fmt(q.resets_at) : t("Unknown"),
          ),
          p.agent_id === "mock"
            ? h(
                "div",
                { class: "cardbottom" },
                button(
                  "Simulate exhausted",
                  () =>
                    api(`/api/quotas/${p.id}`, {
                      status: "rejected",
                      used_pct: 100,
                      resets_at: new Date(Date.now() + 1800000).toISOString(),
                    }).then(refresh),
                  "small",
                ),
                button(
                  "Reset quota",
                  () =>
                    api(`/api/quotas/${p.id}`, {
                      status: "allowed",
                      used_pct: 10,
                      resets_at: null,
                    }).then(refresh),
                  "small ghost",
                ),
              )
            : null,
        );
      }),
    ),
    h(
      "div",
      { class: "card" },
      h("h2", {}, "Switching timeline"),
      state.failovers.length
        ? state.failovers.map((f) =>
            h(
              "div",
              { class: "activity" },
              h("div", { class: "circle" }, "↳"),
              h(
                "div",
                {},
                h("p", {}, `${f.from_profile_id} → ${f.to_profile_id}`),
                h(
                  "small",
                  {},
                  `${f.reason} · T${f.from_tier} → T${f.to_tier} · ${fmt(f.created_at)}`,
                ),
              ),
              button("View run", () => runDetail(f.run_id), "small"),
            ),
          )
        : h(
            "p",
            {},
            "No switches yet. Automatic switching starts disabled. Enable a mock policy inside a project to test it.",
          ),
    ),
    h(
      "div",
      { class: "notice" },
      "Mock runs are excluded from AI usage statistics. No model has been called. Local run counts still enforce workload limits.",
    ),
  );
}
function agentsView() {
  return h(
    "div",
    {},
    heading(
      "WORKERS, WITH CLEAR BOUNDARIES",
      "Agents",
      "Adapter readiness is separate from installation and authentication.",
    ),
    h(
      "div",
      { class: "cards" },
      state.profiles
        .filter((p) => p.id !== "mock-backup")
        .map((p) =>
          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "cardtop" },
              h("h2", {}, p.name),
              badge(
                p.enabled ? "READY" : "BLOCKED",
                p.enabled ? "green" : "amber",
              ),
            ),
            h(
              "p",
              {},
              p.enabled
                ? "Scripted local scenarios: success, failure, input, quota, retry, and untrusted output. No executable code or network calls."
                : "Parser and permission-planning foundations exist. Live execution is disabled until CLI compatibility and sandbox isolation are verified.",
            ),
            h(
              "div",
              { class: "statuslist" },
              [
                ["Execution", p.enabled ? "In-process mock" : "Unavailable"],
                [
                  "Sandbox verification",
                  p.enabled ? "Not applicable — no CLI" : "M0 pending",
                ],
                ["Credentials", "Not accessed"],
                ["Quota source", p.enabled ? "Synthetic fixture" : "Unknown"],
              ].map(([a, b]) =>
                h(
                  "div",
                  { class: "statusrow" },
                  h("span", {}, a),
                  h("span", {}, b),
                ),
              ),
            ),
            p.enabled ? button("New task", newTask, "primary") : null,
          ),
        ),
    ),
    h(
      "div",
      { class: "banner" },
      "A parser passing synthetic fixtures does not mean a CLI is supported. Run “runharbor doctor” for local installation information.",
    ),
  );
}
function securityView() {
  return h(
    "div",
    {},
    heading(
      "SAFE DEFAULTS, VISIBLE LIMITS",
      "Security",
      "Inspect the controls that are implemented, and the release gates that remain.",
    ),
    h(
      "div",
      { class: "banner danger" },
      "Not certified for v1.0. Live agents, remote access, code execution, automatic merges, and paid fallback remain disabled.",
    ),
    h(
      "div",
      { class: "cards" },
      h(
        "div",
        { class: "card" },
        h("h2", {}, "Local service"),
        h(
          "div",
          { class: "statuslist" },
          [
            ["Listen address", "127.0.0.1 only"],
            ["Authentication", "Password + HttpOnly session"],
            ["Request boundary", "Host, Origin, CSRF, no CORS"],
            ["External writes", "Local delivery after approval"],
            ["Data directory", "0700 · files 0600"],
            ["Disk encryption", t("Unknown")],
            ["Telemetry", "None"],
            [
              "Audit chain",
              state.status.audit.valid
                ? `Valid · ${state.status.audit.count} events`
                : "BROKEN",
            ],
          ].map(([a, b]) =>
            h(
              "div",
              { class: "statusrow" },
              h("span", {}, a),
              h("span", {}, b),
            ),
          ),
        ),
        button("Inspect audit chain", auditDialog, "primary"),
      ),
      h(
        "div",
        { class: "card" },
        h("h2", {}, "Release gates"),
        h(
          "p",
          {},
          "The original v1 security checklist is not complete. This development preview proves the mock workflow without enabling unverified real-agent execution.",
        ),
        ...[
          "Live CLI sandbox probes on macOS and Linux",
          "Credential isolation and OS keyring integration",
          "Safe git worktree, commit, review, and merge",
          "Full secret-scanner and deletion coverage",
          "Signed npm and container distribution",
        ].map((s) =>
          h(
            "div",
            { class: "statusrow" },
            h("span", {}, s),
            badge("OPEN", "amber"),
          ),
        ),
      ),
      h(
        "div",
        { class: "card wide" },
        h("h2", {}, "If something goes wrong"),
        h(
          "p",
          {},
          "1. Use Emergency stop or “runharbor stop-all”. 2. Inspect the audit history. 3. Revoke affected credentials in the provider’s official application. 4. Review project files and memory. 5. Restore from a known-good backup before resuming.",
        ),
      ),
    ),
  );
}
async function auditDialog() {
  const data = await api("/api/audit");
  modal(
    "Audit trail",
    h(
      "div",
      { class: "detail" },
      badge(
        data.integrity.valid
          ? `CHAIN VALID · ${data.integrity.count} EVENTS`
          : "CHAIN BROKEN",
        data.integrity.valid ? "green" : "red",
      ),
      h(
        "small",
        {},
        "A local hash chain detects changed rows. It cannot prevent an owner of the data directory from replacing the entire database.",
      ),
      h(
        "pre",
        {},
        data.events
          .map(
            (e) =>
              `${e.seq} · ${e.ts} · ${e.type}\n${JSON.stringify(e.payload)}\n`,
          )
          .join("\n"),
      ),
    ),
  );
}
function settingsView() {
  return h(
    "div",
    {},
    heading(
      "MAKE ROOM FOR YOUR WAY OF WORKING",
      "Settings",
      "Local preferences and workload controls.",
    ),
    h(
      "div",
      { class: "cards" },
      h(
        "div",
        { class: "card" },
        h("h2", {}, "Appearance"),
        h("p", {}, "Choose a quiet workspace for your day."),
        h(
          "div",
          { class: "actions" },
          button("Toggle light / dark", () => {
            localStorage.setItem(
              "theme",
              localStorage.getItem("theme") === "light" ? "dark" : "light",
            );
            render();
          }),
          button(language === "en" ? "繁體中文" : "English", () => {
            language = language === "en" ? "zh-Hant" : "en";
            localStorage.setItem("language", language);
            render();
          }),
        ),
      ),
      h(
        "div",
        { class: "card" },
        h("h2", {}, "Daily run budget"),
        h(
          "p",
          {},
          `${state.status.daily_run_limit} runs per UTC day. Mock workloads count toward this operational limit. Test runs do not.`,
        ),
        button("Change budget", () =>
          form(
            "Daily run budget",
            [
              field(
                "Runs per day",
                "limit",
                "number",
                state.status.daily_run_limit,
                { min: 1, max: 10000, required: true },
              ),
            ],
            (b) => api("/api/settings/budget", { limit: Number(b.limit) }),
            "Save limit",
          ),
        ),
      ),
      h(
        "div",
        { class: "card" },
        h("h2", {}, "First-run tour"),
        h(
          "p",
          {},
          "Create a sample project with an output, an input request, and a paused morning schedule.",
        ),
        button(
          "Try the demo",
          () => api("/api/demo", {}).then(refresh),
          "primary",
        ),
      ),
      h(
        "div",
        { class: "card" },
        h("h2", {}, "Session"),
        h(
          "p",
          {},
          "Idle sessions expire after 12 hours. Signing out closes your event streams.",
        ),
        button(
          "Sign out",
          async () => {
            await api("/api/logout", {});
            events?.close();
            state = null;
            await boot();
          },
          "danger",
        ),
      ),
    ),
  );
}
function searchView() {
  const results = h("div", {});
  let timer;
  const input = h("input", {
    type: "search",
    class: "searchbox",
    placeholder: "Search tasks, runs, outputs, and memory…",
    "aria-label": "Search all work",
    onInput: () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const rows = await api(
            `/api/search?q=${encodeURIComponent(input.value)}`,
          );
          results.replaceChildren(
            ...rows.map((r) =>
              h(
                "div",
                { class: "card" },
                badge(r.kind),
                h("p", {}, r.content),
                button(
                  "Open",
                  () =>
                    r.kind === "runs"
                      ? runDetail(r.id)
                      : r.kind === "artifacts"
                        ? outputDetail(r.id)
                        : r.kind === "tasks"
                          ? taskDetail(state.tasks.find((x) => x.id === r.id))
                          : nav(r.kind === "memories" ? "projects" : r.kind),
                  "small",
                ),
              ),
            ),
          );
          if (!rows.length && input.value)
            results.append(
              empty(
                "No matching work.",
                "Try a shorter phrase or a project name.",
              ),
            );
        } catch (e) {
          toast(e.message);
        }
      }, 200);
    },
  });
  return h(
    "div",
    {},
    heading(
      "FIND THE WORK, NOT THE CHAT",
      "Search",
      "Search includes prompts, three-line summaries, artifact names, and approved memory.",
    ),
    input,
    results,
  );
}
function deliveryFolder(s) {
  form(
    "Set a local delivery folder",
    [
      field("Destination name", "name", "text", "Local reports", {
        required: true,
      }),
      field("Existing absolute folder path", "path", "text", "", {
        required: true,
        full: true,
      }),
      h(
        "div",
        { class: "notice wide" },
        "Each output requires a separate content-bound approval. The agent cannot choose or change this destination.",
      ),
    ],
    async (b) => {
      const d = await api(`/api/projects/${s.project_id}/destination`, b);
      await api(`/api/schedules/${s.id}`, { destination_id: d.id });
    },
    "Save destination",
  );
}
async function approvalDialog(id) {
  const a = state.approvals.find((a) => a.id === id),
    d = state.destinations.find((d) => d.id === a.destination_id),
    artifact = await api(`/api/artifacts/${a.artifact_id}`);
  modal(
    "Review local delivery",
    h(
      "div",
      { class: "detail" },
      h("div", { class: "notice" }, `Destination: ${d.path}/${a.run_id}.md`),
      h(
        "div",
        { class: "badges" },
        badge("LOCAL FILE WRITE", "amber"),
        badge("MOCK OUTPUT"),
      ),
      h("pre", {}, artifact.content),
      h(
        "small",
        {},
        `Approval expires ${fmt(a.expires_at)}. It is bound to this exact content and destination.`,
      ),
      button(
        "Approve this delivery",
        async () => {
          await api(`/api/approvals/${a.id}/approve`, {
            content_hash: a.content_hash,
          });
          dialog.close();
          await refresh();
          toast("Delivered to the approved folder.");
        },
        "primary",
      ),
    ),
  );
}
async function boot() {
  const info = await api("/auth/status");
  if (info.authenticated) {
    csrf = (await api("/api/session")).csrf;
    await refresh();
    events?.close();
    events = new EventSource("/api/events");
    events.addEventListener("change", scheduleRefresh);
    events.addEventListener("run", (e) => {
      const r = JSON.parse(e.data),
        log = document.querySelector("#runlog");
      if (log?.dataset.runId === r.run_id) {
        log.append(
          document.createTextNode(
            `\n${r.ts} ${r.type}\n${JSON.stringify(r.payload)}\n`,
          ),
        );
        log.scrollTop = log.scrollHeight;
      }
      scheduleRefresh();
    });
    return;
  }
  const error = h("div", { class: "error", role: "alert" }),
    setup = info.setup_required;
  const f = h(
    "form",
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const b = Object.fromEntries(new FormData(f));
        const submit = f.querySelector("button");
        submit.disabled = true;
        try {
          const result = await api(setup ? "/auth/setup" : "/auth/login", b);
          csrf = result.csrf;
          await boot();
        } catch (err) {
          error.textContent = err.message;
        } finally {
          submit.disabled = false;
        }
      },
    },
    h("div", { class: "eyebrow" }, "LOCAL. PRIVATE. YOURS."),
    h("h2", {}, setup ? "Welcome to your harbor." : "Welcome back."),
    h(
      "p",
      {},
      setup
        ? "Set a password to protect this local workbench. The one-time setup code is printed in your terminal."
        : "Sign in to see what needs your attention.",
    ),
    setup
      ? field("One-time setup code", "setup_token", "password", "", {
          required: true,
          autocomplete: "off",
        })
      : null,
    field(
      setup ? "Create password · at least 12 characters" : "Password",
      "password",
      "password",
      "",
      {
        required: true,
        minlength: setup ? 12 : 1,
        autocomplete: setup ? "new-password" : "current-password",
      },
    ),
    error,
    h(
      "button",
      { type: "submit", class: "primary" },
      setup ? "Create your workspace →" : "Sign in →",
    ),
    h(
      "p",
      { class: "help" },
      "Development preview · Mock agent only. No model calls or API keys. Live integrations are blocked pending security verification.",
    ),
  );
  root.replaceChildren(
    h(
      "div",
      { class: "auth" },
      h(
        "section",
        { class: "authstory" },
        brand(),
        h("div", { class: "eyebrow" }, "LESS NOISE. MORE FOLLOW-THROUGH."),
        h(
          "h1",
          {},
          "A home for",
          h("br"),
          "your agents.",
          h("br"),
          h("em", {}, "A little less chaos."),
        ),
        h(
          "p",
          {},
          "Give recurring work a rhythm. Keep the results. Step in only when you’re needed.",
        ),
        h(
          "div",
          { class: "onboardsteps" },
          [
            ["01", "Organize work around projects"],
            ["02", "Let schedules keep their own history"],
            ["03", "Focus on the decisions that need you"],
          ].map(([n, s]) => h("div", { class: "step" }, h("b", {}, n), s)),
        ),
      ),
      h("section", { class: "authform" }, f),
    ),
  );
}
window.addEventListener("hashchange", () => {
  route = location.hash.slice(1) || "inbox";
  filter = "all";
  selected.clear();
  render();
});
document.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) ||
    dialog.open
  )
    return;
  if (e.key === "/") {
    e.preventDefault();
    nav("search");
    setTimeout(() => document.querySelector(".searchbox")?.focus(), 20);
  }
  if (e.key === "c") newTask();
  if (e.key === "g") {
    document.onkeyup = (up) => {
      if (up.key === "i") nav("inbox");
      document.onkeyup = null;
    };
  }
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  }
});
boot().catch((e) => {
  root.replaceChildren(
    h(
      "div",
      { class: "empty" },
      h("h2", {}, "Unable to reach RunHarbor"),
      h("p", {}, e.message),
      button("Try again", () => location.reload(), "primary"),
    ),
  );
});
