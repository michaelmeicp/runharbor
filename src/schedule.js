import { Cron } from "croner";
import { insist, text } from "./security.js";

export function cron(expression, timezone) {
  text(expression, "Cron expression", 120);
  insist(
    expression.trim().split(/\s+/).length === 5,
    "Use a five-field cron expression.",
  );
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return new Cron(expression, { timezone, paused: true });
  } catch {
    throw new Error("Invalid cron expression or IANA timezone.");
  }
}
function nextValid(c, expression, timezone, from) {
  // Croner 10.0.1 can shift a nonexistent 02:30 to 03:30. Validate the
  // returned local wall-clock minute against the pattern before accepting it.
  const wall = new Cron(expression, { timezone: "UTC", paused: true });
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let candidate = c.nextRun(from);
  try {
    for (let i = 0; candidate && i < 400; i++) {
      const parts = Object.fromEntries(
        formatter.formatToParts(candidate).map((x) => [x.type, x.value]),
      );
      const local = Date.parse(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`,
      );
      if (wall.nextRun(new Date(local - 60000))?.getTime() === local)
        return candidate;
      candidate = c.nextRun(candidate);
    }
    return null;
  } finally {
    wall.stop();
  }
}
export function nextDates(expression, timezone, from = new Date(), count = 5) {
  const c = cron(expression, timezone),
    dates = [];
  let cursor = from;
  for (let i = 0; i < count; i++) {
    const next = nextValid(c, expression, timezone, cursor);
    if (!next) break;
    dates.push(next.toISOString());
    cursor = next;
  }
  c.stop();
  return dates;
}
export function missedOccurrences(schedule, clock) {
  let next = schedule.next_run_at;
  const due = [];
  const c = cron(schedule.cron_expr, schedule.timezone);
  for (let i = 0; next && Date.parse(next) <= clock && i < 10000; i++) {
    due.push(next);
    next =
      nextValid(
        c,
        schedule.cron_expr,
        schedule.timezone,
        new Date(next),
      )?.toISOString() || null;
  }
  // Bound recovery work after long outages.
  if (next && Date.parse(next) <= clock)
    next =
      nextValid(
        c,
        schedule.cron_expr,
        schedule.timezone,
        new Date(clock),
      )?.toISOString() || null;
  c.stop();
  if (due.length <= 1) return { due, next };
  if (schedule.catch_up_policy === "skip") return { due: [], next };
  if (schedule.catch_up_policy === "run_all")
    return { due: due.slice(-Math.min(3, schedule.catch_up_max || 3)), next };
  return { due: due.slice(-1), next };
}
