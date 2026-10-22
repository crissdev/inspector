import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { Tool } from "@modelcontextprotocol/client";
import { renderWithMantine, screen } from "../../../test/renderWithMantine";
import { setAceTextByLabel } from "../../../test/aceEditor";
import { noopPagination } from "../../../test/fixtures/pagination";
import {
  ToolsScreen,
  type ToolCallRecord,
  type ToolsScreenProps,
  type ToolsUiState,
} from "./ToolsScreen";
import { EMPTY_TOOLS_UI } from "../screenUiState";

const tools: Tool[] = [
  { name: "alpha", inputSchema: { type: "object" } },
  { name: "beta", inputSchema: { type: "object" } },
  {
    name: "gamma",
    inputSchema: {
      type: "object",
      properties: { mode: { type: "string", default: "fast" } },
    },
  },
  {
    name: "delta",
    inputSchema: { type: "object" },
    execution: { taskSupport: "optional" },
  },
];

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

// A completed `alpha` call; override any field per test.
function record(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    id: "call-1",
    toolName: "alpha",
    args: {},
    runAsTask: false,
    startedAt: new Date(2026, 9, 22, 13, 20, 25).getTime(),
    durationMs: 14,
    status: "ok",
    ...overrides,
  };
}

const baseProps = {
  tools,
  listChanged: false,
  serverSupportsTaskToolCalls: false,
  ui: EMPTY_TOOLS_UI,
  onUiChange: vi.fn(),
  onRefreshList: vi.fn(),
  pagination: noopPagination,
  onCallTool: vi.fn(),
};

// ToolsScreen is controlled: selection + form values live in the parent (App)
// as one `ui` object so they persist across tab navigation (#1414). This host
// holds that state so clicking a tool drives the detail panel, mirroring how
// App owns it. Props passed in override defaults; the stateful `ui` wiring is
// applied last so callers can still observe selections via the rendered state.
function ControlledToolsScreen(props: Partial<ToolsScreenProps>) {
  const [ui, setUi] = useState<ToolsUiState>({
    ...EMPTY_TOOLS_UI,
    ...props.ui,
  });
  return (
    <ToolsScreen
      {...baseProps}
      {...props}
      ui={ui}
      onUiChange={(next) => {
        setUi(next);
        props.onUiChange?.(next);
      }}
    />
  );
}

describe("ToolsScreen", () => {
  it("renders the empty selection state", () => {
    renderWithMantine(<ToolsScreen {...baseProps} />);
    expect(
      screen.getByText("Select a tool to view details"),
    ).toBeInTheDocument();
    // With nothing selected there is no request form and no response pane.
    expect(screen.queryByRole("heading", { name: "Response" })).toBeNull();
  });

  it("shows the detail panel when a tool is selected", async () => {
    const user = userEvent.setup();
    renderWithMantine(<ControlledToolsScreen />);
    await user.click(screen.getByText("alpha"));
    expect(
      screen.queryByText("Select a tool to view details"),
    ).not.toBeInTheDocument();
  });

  it("drops an enlarged field when switching between duplicated tool names", async () => {
    // The panel is reused across selections, so SchemaForm resets per-field
    // state on `resetKey`. That key must be the ROW identity: two rows sharing
    // a name would otherwise look like the same entity, and the first copy's
    // enlarged field would stay enlarged over the second copy's (#2042/#1957).
    const user = userEvent.setup();
    const duplicated: Tool[] = [
      {
        name: "get_weather",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string", title: "City" } },
        },
      },
      {
        name: "get_weather",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string", title: "City" } },
        },
      },
    ];
    renderWithMantine(<ControlledToolsScreen tools={duplicated} />);
    const rows = screen.getAllByText("get_weather");

    await user.click(rows[0] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Enlarge City" }));
    expect(screen.getByRole("textbox", { name: /City/ }).tagName).toBe(
      "TEXTAREA",
    );

    await user.click(rows[1] as HTMLElement);
    expect(screen.getByRole("textbox", { name: /City/ }).tagName).toBe("INPUT");
  });

  it("opens the second copy of a duplicated tool name and calls it by its protocol name", async () => {
    // A `tools/list` may repeat a name with a different schema. Selection is
    // keyed by row identity, so the later copy is reachable and the detail
    // panel shows *its* schema — a name-based lookup always resolved the first
    // (#2001). The wire identity stays the duplicated name.
    const user = userEvent.setup();
    const onCallTool = vi.fn();
    const duplicated: Tool[] = [
      {
        name: "get_weather",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string" } },
        },
      },
      {
        name: "get_weather",
        inputSchema: {
          type: "object",
          properties: { zip: { type: "string", default: "94103" } },
        },
      },
    ];
    renderWithMantine(
      <ControlledToolsScreen tools={duplicated} onCallTool={onCallTool} />,
    );
    const rows = screen.getAllByText("get_weather");
    await user.click(rows[1] as HTMLElement);
    // The second copy's own field renders — the first copy's does not.
    expect(screen.getByRole("textbox", { name: /zip/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/city/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Execute/ }));
    expect(onCallTool).toHaveBeenCalledWith(
      "get_weather",
      { zip: "94103" },
      false,
    );
  });

  // #2171's acceptance asks for a test that pins the WIRE rather than the form
  // state. Under the refusal answer the wire claim is that nothing is sent, and
  // `onCallTool` is where a dispatch would begin — so a screen that flagged the
  // draft but still fired the callback would satisfy every other test here.
  //
  // The plain and "Run as task" paths need no separate case: the split between
  // `callTool` and `callToolStream` happens in `App.tsx`, downstream of this
  // callback, so a gate that stops the callback stops both.
  it("dispatches nothing for a draft the schema would retype", async () => {
    const user = userEvent.setup();
    const onCallTool = vi.fn();
    const numeric: Tool[] = [
      {
        name: "add",
        inputSchema: {
          type: "object",
          properties: { count: { type: "number" } },
        },
      },
    ];
    renderWithMantine(
      <ControlledToolsScreen tools={numeric} onCallTool={onCallTool} />,
    );
    await user.click(screen.getByText("add"));
    await user.click(screen.getByLabelText("Edit as JSON"));
    await setAceTextByLabel(/Arguments JSON/, '{"count":"01"}');
    await user.click(screen.getByRole("button", { name: /Execute/ }));

    expect(onCallTool).not.toHaveBeenCalled();

    // And it is the draft that blocks it, not the screen: rewritten with the
    // declared type, the very same click dispatches.
    await setAceTextByLabel(/Arguments JSON/, '{"count":1}');
    await user.click(screen.getByRole("button", { name: /Execute/ }));
    expect(onCallTool).toHaveBeenCalledWith("add", { count: 1 }, false);
  });

  it("threads the sidebar sort order through onUiChange", async () => {
    const user = userEvent.setup();
    const onUiChange = vi.fn();
    renderWithMantine(<ControlledToolsScreen onUiChange={onUiChange} />);
    await user.click(screen.getByRole("button", { name: "Sort tools" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Name (Z–A)" }),
    );
    const last = onUiChange.mock.calls.at(-1)?.[0] as ToolsUiState;
    expect(last.sortOrder).toBe("name-desc");
  });

  it("filters the sidebar list as the search text changes", async () => {
    const user = userEvent.setup();
    renderWithMantine(<ControlledToolsScreen />);
    expect(screen.getByText("beta")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search tools..."), "alpha");
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
  });

  it("carries edited form values through to Execute", async () => {
    const user = userEvent.setup();
    const onCallTool = vi.fn();
    renderWithMantine(<ControlledToolsScreen onCallTool={onCallTool} />);
    await user.click(screen.getByText("gamma"));
    // gamma seeds { mode: "fast" }; editing the field flows through onUiChange.
    const field = screen.getByRole("textbox", { name: /mode/i });
    await user.clear(field);
    await user.type(field, "slow");
    await user.click(screen.getByRole("button", { name: /Execute/ }));
    expect(onCallTool).toHaveBeenCalledWith("gamma", { mode: "slow" }, false);
  });

  it("shows the request form and the response side by side", () => {
    // The redesign keeps the form mounted beside its response, so changing an
    // argument and re-running never needs a dismiss-and-return trip.
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
        history={[record({ result: textResult("ok") })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Execute/ })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Response" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("shows an empty response pane before the tool's first call", () => {
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
      />,
    );
    expect(screen.getByText(/No calls yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Re-run/ })).toBeNull();
  });

  it("lists only the selected tool's calls in its history", () => {
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
        history={[
          record({ id: "b1", toolName: "beta", args: { n: 9 } }),
          record({ id: "a1", args: { n: 1 } }),
        ]}
      />,
    );
    expect(screen.getByText("History (1)")).toBeInTheDocument();
    expect(screen.getByText("n: 1")).toBeInTheDocument();
    expect(screen.queryByText("n: 9")).toBeNull();
  });

  it("shows the newest call by default and restores a picked one into the form", async () => {
    const user = userEvent.setup();
    const onUiChange = vi.fn();
    renderWithMantine(
      <ControlledToolsScreen
        onUiChange={onUiChange}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
        history={[
          record({ id: "new", args: { n: 2 }, result: textResult("second") }),
          record({ id: "old", args: { n: 1 }, result: textResult("first") }),
        ]}
      />,
    );
    expect(screen.getByText("second")).toBeInTheDocument();
    await user.click(screen.getByText("n: 1"));
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.queryByText("second")).toBeNull();
    const last = onUiChange.mock.calls.at(-1)?.[0] as ToolsUiState;
    expect(last.viewedCallId).toBe("old");
    expect(last.formValues).toEqual({ n: 1 });
  });

  it("re-runs the shown call with its arguments and task routing", async () => {
    const user = userEvent.setup();
    const onCallTool = vi.fn();
    const onUiChange = vi.fn();
    renderWithMantine(
      <ControlledToolsScreen
        onCallTool={onCallTool}
        onUiChange={onUiChange}
        ui={{
          ...EMPTY_TOOLS_UI,
          selectedToolKey: "3:delta",
          viewedCallId: "old",
        }}
        history={[
          record({ id: "new", toolName: "delta", args: { n: 2 } }),
          record({
            id: "old",
            toolName: "delta",
            args: { n: 1 },
            runAsTask: true,
          }),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Re-run/ }));
    expect(onCallTool).toHaveBeenCalledWith("delta", { n: 1 }, true);
    // The re-run lands as the newest call, so the pane follows it, and the
    // form shows the arguments it was sent with.
    const last = onUiChange.mock.calls.at(-1)?.[0] as ToolsUiState;
    expect(last.viewedCallId).toBeUndefined();
    expect(last.formValues).toEqual({ n: 1 });
  });

  it("points the response pane back at the newest call on Execute", async () => {
    const user = userEvent.setup();
    const onUiChange = vi.fn();
    renderWithMantine(
      <ControlledToolsScreen
        onUiChange={onUiChange}
        ui={{
          ...EMPTY_TOOLS_UI,
          selectedToolKey: "0:alpha",
          viewedCallId: "old",
        }}
        history={[record({ id: "old" })]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Execute/ }));
    const last = onUiChange.mock.calls.at(-1)?.[0] as ToolsUiState;
    expect(last.viewedCallId).toBeUndefined();
  });

  it("reopens a previously called tool on its last call's arguments", async () => {
    const user = userEvent.setup();
    const onCallTool = vi.fn();
    renderWithMantine(
      <ControlledToolsScreen
        onCallTool={onCallTool}
        history={[record({ toolName: "gamma", args: { mode: "slow" } })]}
      />,
    );
    // gamma's schema default is "fast"; its last call sent "slow", and the
    // response pane shows that call, so the form must agree with it.
    await user.click(screen.getByText("gamma"));
    expect(screen.getByRole("textbox", { name: /mode/i })).toHaveValue("slow");
    await user.click(screen.getByRole("button", { name: /Execute/ }));
    expect(onCallTool).toHaveBeenCalledWith("gamma", { mode: "slow" }, false);
  });

  it("invokes onCallTool with form values on Execute", async () => {
    const user = userEvent.setup();
    const onCallTool = vi.fn();
    renderWithMantine(<ControlledToolsScreen onCallTool={onCallTool} />);
    await user.click(screen.getByText("alpha"));
    await user.click(screen.getByRole("button", { name: /Execute/ }));
    expect(onCallTool).toHaveBeenCalledWith("alpha", {}, false);
  });

  it("seeds schema defaults so untouched fields are sent on Execute", async () => {
    const user = userEvent.setup();
    const onCallTool = vi.fn();
    renderWithMantine(<ControlledToolsScreen onCallTool={onCallTool} />);
    await user.click(screen.getByText("gamma"));
    // Execute without editing the form: the default must still be sent.
    await user.click(screen.getByRole("button", { name: /Execute/ }));
    expect(onCallTool).toHaveBeenCalledWith("gamma", { mode: "fast" }, false);
  });

  it("keeps the history when the screen unmounts and remounts", () => {
    // History is App-owned and must survive a tab switch, which unmounts the
    // screen (#1414).
    const props = {
      ...baseProps,
      ui: { ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" },
      history: [record({ result: textResult("kept") })],
    };
    const { unmount } = renderWithMantine(<ToolsScreen {...props} />);
    unmount();
    renderWithMantine(<ToolsScreen {...props} />);
    expect(screen.getByText("kept")).toBeInTheDocument();
  });

  it("treats pending callState as executing", () => {
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
        callState={{ status: "pending", toolName: "alpha" }}
      />,
    );
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
    expect(screen.getByText("Waiting for the server…")).toBeInTheDocument();
  });

  it("shows the in-flight call only in its own tool's response pane", () => {
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "1:beta" }}
        callState={{ status: "pending", toolName: "alpha" }}
      />,
    );
    expect(screen.queryByText("Waiting for the server…")).toBeNull();
  });

  it("invokes onCancelCall when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancelCall = vi.fn();
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
        onCancelCall={onCancelCall}
        callState={{ status: "pending" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onCancelCall).toHaveBeenCalledTimes(1);
  });

  it("threads the Run-as-task toggle through onUiChange", async () => {
    const user = userEvent.setup();
    const onUiChange = vi.fn();
    renderWithMantine(
      <ControlledToolsScreen
        serverSupportsTaskToolCalls
        onUiChange={onUiChange}
      />,
    );
    // delta advertises optional task support, so the switch renders.
    await user.click(screen.getByText("delta"));
    await user.click(screen.getByLabelText("Run as task"));
    expect(onUiChange).toHaveBeenCalled();
    const last = onUiChange.mock.calls.at(-1)?.[0] as ToolsUiState;
    expect(last.runAsTask).toBe(true);
  });

  it("does not crash when onCancelCall is undefined", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
        onCancelCall={undefined}
        callState={{ status: "pending", toolName: "alpha" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
  });

  it("renders a thrown error from history as an error panel (#1632)", () => {
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
        history={[
          record({ status: "error", error: "boom", errorCode: -32603 }),
        ]}
      />,
    );
    // Once as the header status, once on the history row.
    expect(screen.getAllByText("Failed")).toHaveLength(2);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("renders the unknown-tool hint for a -32602 rejection (#1632)", () => {
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
        history={[
          record({
            status: "error",
            error: "MCP error -32602: Tool ghost_tool not found",
            errorCode: -32602,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Unknown Tool")).toBeInTheDocument();
  });

  it("shows an error written by step-up recovery, which has no history record", () => {
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
        callState={{ status: "error", error: "Authorization was not granted" }}
      />,
    );
    expect(
      screen.getByText("Authorization was not granted"),
    ).toBeInTheDocument();
  });

  it("does not repeat a recorded call's error above its own response", () => {
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        ui={{ ...EMPTY_TOOLS_UI, selectedToolKey: "0:alpha" }}
        callState={{ status: "error", error: "boom", toolName: "alpha" }}
        history={[record({ status: "error", error: "boom" })]}
      />,
    );
    expect(screen.getAllByText("boom")).toHaveLength(1);
  });

  it("renders excluded tools in the sidebar with the reason (#1632)", () => {
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        excludedTools={[
          {
            tool: {
              name: "invalid_header_tool",
              inputSchema: { type: "object" },
            },
            reason:
              "value: x-mcp-header 'Bad Header' is not a valid RFC 9110 token",
          },
        ]}
      />,
    );
    expect(screen.getByText("Excluded (SEP-2243)")).toBeInTheDocument();
    expect(screen.getByText("invalid_header_tool")).toBeInTheDocument();
  });
});

// The `data-*` readiness contract the headless tab smoke drives (#2148). It is
// a documented public contract (clients/web/README.md), and a smoke asserting
// it fails as an opaque 45s timeout rather than a mismatch — so the attribute
// names are pinned here, where a rename fails loudly instead.
describe("automation contract (#2148)", () => {
  it("reports the tool count and an idle call status", () => {
    renderWithMantine(<ToolsScreen {...baseProps} />);
    const root = screen.getByTestId("tools-screen");
    expect(root).toHaveAttribute("data-tool-count", String(tools.length));
    // Absent call state reads `idle`, not empty: the smoke waits on a value.
    expect(root).toHaveAttribute("data-call-status", "idle");
  });

  it("reports an empty list distinctly from a missing one", () => {
    renderWithMantine(<ToolsScreen {...baseProps} tools={[]} />);
    expect(screen.getByTestId("tools-screen")).toHaveAttribute(
      "data-tool-count",
      "0",
    );
  });

  it("tracks the call status through to a result", () => {
    renderWithMantine(
      <ToolsScreen
        {...baseProps}
        callState={{
          status: "ok",
          result: { content: [{ type: "text", text: "done" }] },
        }}
      />,
    );
    expect(screen.getByTestId("tools-screen")).toHaveAttribute(
      "data-call-status",
      "ok",
    );
  });
});
