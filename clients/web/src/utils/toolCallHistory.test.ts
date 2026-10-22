import { describe, expect, it } from "vitest";
import {
  executeShortcutLabel,
  formatCallClock,
  formatCallDuration,
  summarizeCallArgs,
} from "./toolCallHistory";

describe("formatCallClock", () => {
  it("formats local time as zero-padded 24-hour HH:MM:SS", () => {
    expect(formatCallClock(new Date(2026, 9, 22, 9, 5, 7).getTime())).toBe(
      "09:05:07",
    );
    expect(formatCallClock(new Date(2026, 9, 22, 21, 30, 0).getTime())).toBe(
      "21:30:00",
    );
  });
});

describe("formatCallDuration", () => {
  it("uses milliseconds under a second", () => {
    expect(formatCallDuration(0)).toBe("0 ms");
    expect(formatCallDuration(999)).toBe("999 ms");
  });

  it("uses seconds with two decimals under a minute", () => {
    expect(formatCallDuration(1000)).toBe("1.00 s");
    expect(formatCallDuration(10_120)).toBe("10.12 s");
  });

  it("uses minutes and padded seconds beyond a minute", () => {
    expect(formatCallDuration(60_000)).toBe("1m 00s");
    expect(formatCallDuration(125_400)).toBe("2m 05s");
  });
});

describe("summarizeCallArgs", () => {
  it("names an empty argument object rather than rendering nothing", () => {
    expect(summarizeCallArgs({})).toBe("(no arguments)");
  });

  it("lists each argument with its JSON value", () => {
    expect(summarizeCallArgs({ message: "hi", limit: 10, deep: [1] })).toBe(
      'message: "hi", limit: 10, deep: [1]',
    );
  });

  it("spells out an undefined value, which JSON.stringify drops", () => {
    expect(summarizeCallArgs({ x: undefined })).toBe("x: undefined");
  });

  it("truncates to the maximum length with an ellipsis", () => {
    const summary = summarizeCallArgs({ text: "a".repeat(50) }, 20);
    expect(summary).toHaveLength(20);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("leaves a summary at exactly the maximum length alone", () => {
    expect(summarizeCallArgs({ ab: 1 }, 5)).toBe("ab: 1");
  });
});

describe("executeShortcutLabel", () => {
  it("uses the command key on Apple platforms", () => {
    expect(executeShortcutLabel("MacIntel")).toBe("⌘ ↵");
    expect(executeShortcutLabel("iPhone")).toBe("⌘ ↵");
    expect(executeShortcutLabel("iPad")).toBe("⌘ ↵");
  });

  it("uses Ctrl everywhere else", () => {
    expect(executeShortcutLabel("Win32")).toBe("Ctrl ↵");
    expect(executeShortcutLabel("Linux x86_64")).toBe("Ctrl ↵");
    expect(executeShortcutLabel("")).toBe("Ctrl ↵");
  });
});
