import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, screen } from "../../../test/renderWithMantine";
import type { ToolCallRecord } from "../../screens/ToolsScreen/ToolsScreen";
import {
  ToolResponsePanel,
  type ToolResponsePanelProps,
} from "./ToolResponsePanel";

function record(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    id: "call-1",
    toolName: "echo",
    args: { message: "hello" },
    runAsTask: false,
    startedAt: new Date(2026, 9, 22, 13, 20, 25).getTime(),
    durationMs: 14,
    status: "ok",
    result: { content: [{ type: "text", text: "Echo: hello" }] },
    ...overrides,
  };
}

const baseProps: ToolResponsePanelProps = {
  pending: false,
  history: [],
  shortcutLabel: "⌘ ↵",
  onSelectRecord: vi.fn(),
  onRerun: vi.fn(),
};

describe("ToolResponsePanel", () => {
  it("invites a first call, naming the shortcut, when there is none", () => {
    renderWithMantine(<ToolResponsePanel {...baseProps} />);
    expect(screen.getByText(/No calls yet/)).toHaveTextContent("⌘ ↵");
    expect(screen.queryByRole("button", { name: /Re-run/ })).toBeNull();
    expect(screen.queryByText(/History/)).toBeNull();
  });

  it("shows a running state while a call is in flight", () => {
    const shown = record();
    renderWithMantine(
      <ToolResponsePanel
        {...baseProps}
        pending
        record={shown}
        history={[shown]}
      />,
    );
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Waiting for the server…")).toBeInTheDocument();
    // The previous response gives way to the running state, and its timing
    // would describe the wrong call.
    expect(screen.queryByText("Echo: hello")).toBeNull();
    expect(screen.queryByText(/14 ms ·/)).toBeNull();
    expect(screen.getByRole("button", { name: /Re-run/ })).toBeDisabled();
  });

  it("shows a running state on a tool's very first call", () => {
    renderWithMantine(<ToolResponsePanel {...baseProps} pending />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("shows a successful result with its status, duration and time", () => {
    renderWithMantine(<ToolResponsePanel {...baseProps} record={record()} />);
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("14 ms · 13:20:25")).toBeInTheDocument();
    expect(screen.getByText("Echo: hello")).toBeInTheDocument();
  });

  it("labels a result the tool flagged with isError as a tool error", () => {
    renderWithMantine(
      <ToolResponsePanel
        {...baseProps}
        record={record({
          status: "error",
          result: {
            isError: true,
            content: [{ type: "text", text: "disk full" }],
          },
        })}
      />,
    );
    expect(screen.getByText("Tool error")).toBeInTheDocument();
    expect(screen.getByText("disk full")).toBeInTheDocument();
  });

  it("renders a call that failed without a result as an error panel", () => {
    renderWithMantine(
      <ToolResponsePanel
        {...baseProps}
        record={record({
          status: "error",
          result: undefined,
          error: "MCP error -32602: Tool ghost not found",
          errorCode: -32602,
        })}
      />,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Unknown Tool")).toBeInTheDocument();
  });

  it("falls back to a stock message for a failure with none", () => {
    renderWithMantine(
      <ToolResponsePanel
        {...baseProps}
        record={record({ status: "error", result: undefined })}
      />,
    );
    expect(
      screen.getByText("The call failed without an error message."),
    ).toBeInTheDocument();
  });

  it("explains a cancelled call", () => {
    renderWithMantine(
      <ToolResponsePanel
        {...baseProps}
        record={record({ status: "cancelled", result: undefined })}
      />,
    );
    expect(screen.getAllByText("Cancelled")).not.toHaveLength(0);
    expect(
      screen.getByText(/cancellation was sent to the server/),
    ).toBeInTheDocument();
  });

  it("shows an error no record carries above the response", () => {
    renderWithMantine(
      <ToolResponsePanel
        {...baseProps}
        record={record()}
        unrecordedError={{ error: "Authorization was not granted" }}
      />,
    );
    expect(
      screen.getByText("Authorization was not granted"),
    ).toBeInTheDocument();
    expect(screen.getByText("Echo: hello")).toBeInTheDocument();
  });

  it("re-runs the shown call", async () => {
    const user = userEvent.setup();
    const onRerun = vi.fn();
    const shown = record();
    renderWithMantine(
      <ToolResponsePanel {...baseProps} record={shown} onRerun={onRerun} />,
    );
    await user.click(screen.getByRole("button", { name: /Re-run/ }));
    expect(onRerun).toHaveBeenCalledWith(shown);
  });

  it("lists the history with argument summaries and marks the shown call", () => {
    const newer = record({ id: "b", args: { message: "second" } });
    const older = record({ id: "a", durationMs: 1250 });
    renderWithMantine(
      <ToolResponsePanel
        {...baseProps}
        record={older}
        history={[newer, older]}
      />,
    );
    expect(screen.getByText("History (2)")).toBeInTheDocument();
    expect(screen.getByText('message: "second"')).toBeInTheDocument();
    expect(screen.getByText("1.25 s")).toBeInTheDocument();
    const shownRow = screen
      .getByText('message: "hello"')
      .closest(".mantine-NavLink-root");
    const otherRow = screen
      .getByText('message: "second"')
      .closest(".mantine-NavLink-root");
    expect(shownRow).toHaveAttribute("data-active");
    expect(otherRow).not.toHaveAttribute("data-active");
  });

  it("selects a history row", async () => {
    const user = userEvent.setup();
    const onSelectRecord = vi.fn();
    const older = record({ id: "a" });
    const newer = record({ id: "b", args: { message: "second" } });
    renderWithMantine(
      <ToolResponsePanel
        {...baseProps}
        record={newer}
        history={[newer, older]}
        onSelectRecord={onSelectRecord}
      />,
    );
    await user.click(screen.getByText('message: "hello"'));
    expect(onSelectRecord).toHaveBeenCalledWith(older);
  });

  it("marks no history row while a new call is in flight", () => {
    const shown = record();
    renderWithMantine(
      <ToolResponsePanel
        {...baseProps}
        pending
        record={shown}
        history={[shown]}
      />,
    );
    expect(
      screen.getByText('message: "hello"').closest(".mantine-NavLink-root"),
    ).not.toHaveAttribute("data-active");
  });
});
