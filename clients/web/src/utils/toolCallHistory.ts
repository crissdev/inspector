/**
 * Pure formatters for the Tools screen's response pane: the clock time and
 * duration a past call is labelled with, the one-line argument summary its
 * history row shows, and the platform-appropriate Execute shortcut label.
 * Kept here (not in the component) so they are testable without a render.
 */

/** Local wall-clock time, `HH:MM:SS`, 24-hour regardless of locale. */
export function formatCallClock(epochMs: number): string {
  const d = new Date(epochMs);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/** `14 ms` under a second, `1.24 s` under a minute, `2m 05s` beyond. */
export function formatCallDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * A single-line, length-capped summary of a call's arguments —
 * `message: "hello", limit: 10` — for a history row. `(no arguments)` for an
 * empty object so the row never reads as blank.
 */
export function summarizeCallArgs(
  args: Record<string, unknown>,
  maxLength = 80,
): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "(no arguments)";
  const text = entries
    .map(([key, value]) => `${key}: ${JSON.stringify(value) ?? "undefined"}`)
    .join(", ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** The Execute shortcut as the user's platform spells it. */
export function executeShortcutLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? "⌘ ↵" : "Ctrl ↵";
}
