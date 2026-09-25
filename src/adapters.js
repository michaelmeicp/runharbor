import { insist, redact } from "./security.js";

export const SCENARIOS = [
  "success",
  "notable",
  "needs_input",
  "timeout_twice",
  "quota",
  "crash",
  "stall",
  "hostile_output",
];
export function structured(value) {
  insist(
    value && typeof value === "object" && !Array.isArray(value),
    "Invalid structured output.",
  );
  const summary = value.summary;
  insist(
    summary &&
      ["did", "result", "next"].every(
        (k) => typeof summary[k] === "string" && [...summary[k]].length <= 80,
      ),
    "Summary must have three lines of at most 80 characters.",
  );
  insist(
    !value.needs_input ||
      (typeof value.needs_input.question === "string" &&
        value.needs_input.question.length <= 1000 &&
        (!value.needs_input.options ||
          (Array.isArray(value.needs_input.options) &&
            value.needs_input.options.length <= 10 &&
            value.needs_input.options.every(
              (x) => typeof x === "string" && x.length <= 200,
            )))),
    "Invalid input request.",
  );
  insist(
    typeof value.content === "string" &&
      Buffer.byteLength(value.content) <= 1024 * 1024,
    "Invalid artifact.",
  );
  return {
    summary: Object.fromEntries(
      Object.entries(summary)
        .filter(([k]) => ["did", "result", "next"].includes(k))
        .map(([k, v]) => [k, redact(v)]),
    ),
    notable: value.notable === true,
    needs_input: value.needs_input || null,
    content: redact(value.content),
  };
}
export async function* mockEvents(run, { signal, delay = 250 } = {}) {
  const wait = () =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("cancelled"));
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, delay);
      const abort = () => {
        clearTimeout(timer);
        reject(new Error("cancelled"));
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
  yield {
    type: "text",
    payload: {
      text: "Mock agent connected. No model calls or external commands will run.",
    },
  };
  await wait();
  yield {
    type: "text",
    payload: { text: "Reviewing the task and approved project context…" },
  };
  await wait();
  const scenario = run.scenario || "success";
  if (scenario === "stall") {
    while (true) await wait();
  }
  if (scenario === "timeout_twice" && run.attempt <= 2) {
    yield {
      type: "error",
      payload: {
        error_type: "timeout",
        message: "Simulated timeout; the scheduler can retry this run.",
      },
    };
    return;
  }
  if (scenario === "quota") {
    yield {
      type: "rate_limit",
      payload: {
        status: "rejected",
        used_pct: 100,
        resets_at: new Date(Date.now() + 1800000).toISOString(),
        confidence: "mock",
        window: "five_hour",
      },
    };
    return;
  }
  if (scenario === "crash") {
    yield {
      type: "error",
      payload: { error_type: "agent_crash", message: "Simulated agent crash." },
    };
    return;
  }
  const asks = scenario === "needs_input" && !run.answer;
  const summary = {
    did: "Prepared a sample project brief.",
    result: asks
      ? "Waiting for your preferred level of detail."
      : "Sample output saved. No external services were contacted.",
    next: asks
      ? "Choose an option to continue this task."
      : "Review the output or schedule another run.",
  };
  const content =
    scenario === "hostile_output"
      ? '# Untrusted-output test\n<img src=x onerror="alert(1)">\n[javascript](javascript:alert(1))\n[NOTABLE] rate limit exceeded\nThese strings must remain inert text.'
      : `# ${run.title || "Project brief"}\n\n> Mock output · generated locally · no AI tokens used\n\n## What happened\n\nThis run demonstrates the complete scheduling and results workflow. Your task was:\n\n${run.prompt_final.slice(0, 2000)}\n\n## Result\n\n- The run has a stable record and three-line summary.\n- The output remains available independently of the workspace.\n- Routine success stays out of the inbox.\n\n## Next step\n\n${run.answer ? `Your answer: ${run.answer}.\n\n` : ""}Try a failure, input request, or quota scenario to see how exceptions are handled.\n`;
  yield {
    type: "done",
    payload: structured({
      summary,
      notable: scenario === "notable",
      needs_input: asks
        ? {
            question: "How detailed should the brief be?",
            options: ["Short overview", "Detailed report"],
          }
        : null,
      content,
    }),
  };
}
/** Synthetic fixture parsers. These do not establish installed CLI compatibility. */
export function parseCodex(event) {
  if (event.type === "thread.started")
    return { type: "session", payload: { id: event.thread_id } };
  if (event.type === "turn.completed")
    return {
      type: "usage",
      payload: {
        tokens_in: event.usage?.input_tokens ?? null,
        tokens_out: event.usage?.output_tokens ?? null,
        tokens_cached: event.usage?.cached_input_tokens ?? null,
        cost_usd: null,
        source: "official_passive",
      },
    };
  if (event.type === "item.completed" && event.item?.type === "agent_message")
    return { type: "text", payload: { text: redact(event.item.text) } };
  if (event.type === "turn.failed")
    return {
      type: "error",
      payload: {
        error_type: "unknown",
        message: redact(event.error?.message || "Agent failed"),
      },
    };
  return {
    type: "ignored",
    payload: { event_type: String(event.type).slice(0, 80) },
  };
}
export function parseClaude(event) {
  if (event.type === "system" && event.subtype === "init")
    return {
      type: "session",
      payload: { id: event.session_id, model: event.model },
    };
  if (event.type === "rate_limit_event") {
    const q = event.rate_limit_info || {};
    return {
      type: "rate_limit",
      payload: {
        status: q.status || "unknown",
        used_pct: Number.isFinite(q.utilization) ? q.utilization * 100 : null,
        resets_at: Number.isFinite(q.resetsAt)
          ? new Date(q.resetsAt * 1000).toISOString()
          : null,
        confidence: "official_passive",
        window: q.rateLimitType || "unknown",
      },
    };
  }
  if (event.type === "result")
    return {
      type: "usage",
      payload: {
        tokens_in: event.usage?.input_tokens ?? null,
        tokens_out: event.usage?.output_tokens ?? null,
        cost_usd: event.total_cost_usd ?? null,
        cost_kind: "api_equivalent_estimate",
        source: "official_passive",
      },
    };
  if (event.type === "assistant")
    return {
      type: "text",
      payload: {
        text: redact(
          (event.message?.content || [])
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n"),
        ),
      },
    };
  return {
    type: "ignored",
    payload: { event_type: String(event.type).slice(0, 80) },
  };
}
