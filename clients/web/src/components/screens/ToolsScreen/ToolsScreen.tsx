import { Card, Flex, Stack, Text } from "@mantine/core";
import type { MalformedListItem } from "@inspector/core/mcp";
import type {
  CallToolResult,
  ReadResourceResult,
  Tool,
} from "@modelcontextprotocol/client";
import type { ExcludedTool } from "@inspector/core/mcp/types.js";
import { ToolControls } from "../../groups/ToolControls/ToolControls";
import type { ListPaginationControlsProps } from "../../elements/ListPaginationControls/ListPaginationControls";
import {
  ToolDetailPanel,
  type ToolProgress,
} from "../../groups/ToolDetailPanel/ToolDetailPanel";
import { ToolResponsePanel } from "../../groups/ToolResponsePanel/ToolResponsePanel";
import { collectSchemaDefaults, toFormSchema } from "../../../utils/jsonUtils";
import { findToolByRowKey } from "../../../utils/toolUtils";
import { executeShortcutLabel } from "../../../utils/toolCallHistory";

export interface ToolCallState {
  status: "idle" | "pending" | "ok" | "error";
  result?: CallToolResult;
  error?: string;
  /**
   * JSON-RPC error code when the call REJECTED (a thrown `ProtocolError`) rather
   * than resolving a result. SDK v2 rejects an unknown-tool call with `-32602`
   * instead of returning an `isError` result, so this drives the distinct
   * "Unknown Tool" rendering in the error panel (#1632).
   */
  errorCode?: number;
  progress?: ToolProgress;
  /**
   * The tool the call targets, set by every `onCallTool` write. Absent only on
   * an error written from outside the call — a failed step-up auth recovery —
   * which has no history record and is shown above the response instead.
   */
  toolName?: string;
}

/**
 * One completed `tools/call`, kept so the response pane can show past calls
 * beside the request form and re-send any of them. Held in App-level panel
 * state (not `ToolsUiState`), since results can be large and the UI state is
 * snapshotted into `sessionStorage` across an OAuth redirect.
 */
export interface ToolCallRecord {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  /** The effective task routing the call was sent with, so a re-run matches. */
  runAsTask: boolean;
  startedAt: number;
  durationMs: number;
  status: "ok" | "error" | "cancelled";
  result?: CallToolResult;
  error?: string;
  errorCode?: number;
}

// Selection, form values, and sidebar search — controlled by the parent (App)
// as one object so they persist across tab navigation within a live session;
// the screen unmounts on tab switch, so local state would be lost (#1414/#1417).
export interface ToolsUiState {
  /**
   * The selected row's `toolRowKey` — its position in the list plus its name,
   * not the name alone. A `tools/list` may repeat a name, and identifying the
   * selection by name highlighted every copy while the detail panel always
   * resolved the first, so the later copies could not be inspected (#2001).
   * The protocol name a `tools/call` sends still comes from the resolved tool.
   */
  selectedToolKey?: string;
  formValues: Record<string, unknown>;
  search: string;
  // Screen-level "Run as task" toggle, shared across tools (not per-tool):
  // selecting a different tool keeps the current value. Persists across tab
  // navigation like the rest of the UI state, and is only honored for the
  // selected tool when its `execution.taskSupport` is "optional" (a "required"
  // tool is always run as a task, "forbidden" never) — see ToolDetailPanel.
  runAsTask: boolean;
  /**
   * The history record the response pane is showing. Unset means "the most
   * recent call of the selected tool", which is what a fresh call lands on.
   */
  viewedCallId?: string;
}

export interface ToolsScreenProps {
  tools: Tool[];
  /** Tools the SDK excluded from `tools/list` for invalid `x-mcp-header`
   * annotations (SEP-2243), shown in the sidebar with the reason (#1632). */
  excludedTools?: ExcludedTool[];
  /**
   * Entries dropped from a list result as malformed, across every list method.
   * Each list panel filters for its own and warns about them (#1909).
   */
  malformedListItems?: MalformedListItem[];
  callState?: ToolCallState;
  /** Completed calls, newest first, across every tool. */
  history?: ToolCallRecord[];
  ui: ToolsUiState;
  listChanged: boolean;
  /**
   * Whether to offer the per-call "Run as task" choice: a legacy server that
   * advertises `tasks.requests.tools.call`. Always false on a modern
   * connection, where task creation is server-directed (#2674).
   */
  serverSupportsTaskToolCalls: boolean;
  onUiChange: (next: ToolsUiState) => void;
  onRefreshList: () => void;
  /** A failed list load, rendered above the sidebar list (#1953). */
  loadError?: Error | null;
  /** Pagination controls rendered in the sidebar (#1721). */
  pagination: ListPaginationControlsProps;
  onCallTool: (
    name: string,
    args: Record<string, unknown>,
    runAsTask?: boolean,
  ) => void;
  onCancelCall?: () => void;
  /**
   * Read-on-demand handler for `resource_link` blocks in a tool result.
   * Passed through to the result panel so links can inline their contents.
   */
  onReadResource?: (uri: string) => Promise<ReadResourceResult>;
}

// Caps the detail/result columns at the screen's available height: full
// viewport minus the app-shell header and the screen's top+bottom xl padding,
// leaving the bottom margin the overflow used to eat.
const SCROLL_MAX_HEIGHT =
  "calc(100dvh - var(--app-shell-header-height, 0px) - var(--app-shell-footer-height, 0px) - var(--mantine-spacing-xl) * 2)";

// No `align` override: children stretch to the row's full height, giving each
// column pane a definite height. That definite height is what lets a column's
// inner ScrollArea know how much it can shrink into (a bare `mah` doesn't —
// see the Prompts/Resources preview panes this mirrors).
const ScreenLayout = Flex.withProps({
  variant: "screen",
  h: "calc(100dvh - var(--app-shell-header-height, 0px) - var(--app-shell-footer-height, 0px))",
  gap: "md",
  p: "xl",
});

const Sidebar = Stack.withProps({
  // Widened from 340 to comfortably fit the pagination controls
  // (Load-next-page button + status) without cramping list entries (#1721).
  w: 360,
  flex: "0 0 auto",
});

// `sidebar` variant makes the card a full-height flex column capped at the
// screen height, so ToolControls' list fills the card and scrolls internally
// once it overflows (matching the Resources sidebar). (#1417)
const SidebarCard = Card.withProps({
  withBorder: true,
  padding: "lg",
  variant: "sidebar",
});

// Column wrapper: stretches to the screen's available height (capped by the
// consumer-set `mah`) so the card inside has a definite height to shrink into.
const ContentPane = Flex.withProps({
  flex: 1,
  miw: 0,
  direction: "column",
  align: "stretch",
});

// Detail/result column card: `variant="preview"` (overflow: hidden) lets the
// panel's inner ScrollArea take over scrolling instead of the card bleeding
// past the viewport. Sizes to content when short, caps at the pane when tall.
const ContentCard = Card.withProps({
  withBorder: true,
  padding: "lg",
  variant: "preview",
});

// Full-height card for the empty placeholder (used with `flex={1}`) so it fills
// the screen height like the Prompts/Resources placeholders, rather than
// shrinking to its text. The result/detail states keep the content-sized
// `ContentCard` (their inner ScrollArea handles overflow).
const DetailCard = Card.withProps({
  withBorder: true,
  padding: "lg",
});

// The response column always fills the pane, so its history list pins to the
// bottom and the response body takes the height between.
const ResponseCard = Card.withProps({
  withBorder: true,
  padding: "lg",
  variant: "preview",
  flex: 1,
});

const NO_HISTORY: ToolCallRecord[] = [];

const EmptyState = Text.withProps({
  c: "dimmed",
  ta: "center",
  py: "xl",
});

export function ToolsScreen({
  tools,
  excludedTools,
  malformedListItems,
  callState,
  history = NO_HISTORY,
  ui,
  listChanged,
  serverSupportsTaskToolCalls,
  onUiChange,
  onRefreshList,
  loadError,
  pagination,
  onCallTool,
  onCancelCall,
  onReadResource,
}: ToolsScreenProps) {
  const { selectedToolKey, formValues, search } = ui;
  const selectedTool = findToolByRowKey(tools, selectedToolKey);
  const isExecuting = callState?.status === "pending";
  const toolHistory = selectedTool
    ? history.filter((record) => record.toolName === selectedTool.name)
    : [];
  // An unset (or stale) `viewedCallId` falls back to the newest call, which is
  // where a fresh Execute lands.
  const viewedRecord =
    toolHistory.find((record) => record.id === ui.viewedCallId) ??
    toolHistory[0];
  const shortcutLabel = executeShortcutLabel(navigator.platform);
  // Every error `onCallTool` writes names its tool and is also in the history;
  // one without a tool came from step-up auth recovery and has no record.
  const unrecordedError =
    callState?.status === "error" && callState.error && !callState.toolName
      ? { error: callState.error, errorCode: callState.errorCode }
      : undefined;

  const handleSelectTool = (key: string) => {
    // Seed the form with the tool's schema defaults so default-only fields the
    // user never edits are still sent on execute (the form shows defaults via
    // resolveValue, but onChange only writes edited fields).
    const tool = findToolByRowKey(tools, key);
    // `key` always comes from the rendered tools list (ToolControls only emits
    // keys it computed from the tools it was given), so the lookup never misses;
    // the empty-object fallback is an unreachable defensive default.
    let nextFormValues: Record<string, unknown> = {};
    /* v8 ignore next -- unreachable: onSelectTool always keys a tool in the list */
    if (tool) {
      // A tool called before reopens on its last call's arguments, so the form
      // agrees with the response pane, which shows that call.
      const lastCall = history.find((record) => record.toolName === tool.name);
      nextFormValues =
        lastCall?.args ??
        collectSchemaDefaults(toFormSchema(tool.inputSchema) ?? {});
    }
    onUiChange({
      ...ui,
      selectedToolKey: key,
      formValues: nextFormValues,
      viewedCallId: undefined,
    });
  };

  return (
    // `data-*` readiness contract for the headless tab smoke (#2148); see
    // clients/web/README.md#core-tab-automation-contract. Attributes are not
    // part of a component's typed props, so they are passed here rather than
    // baked into the `ScreenLayout` constant.
    <ScreenLayout
      data-testid="tools-screen"
      data-tool-count={tools.length}
      data-call-status={callState?.status ?? "idle"}
    >
      <Sidebar>
        <SidebarCard>
          <ToolControls
            tools={tools}
            excludedTools={excludedTools}
            malformedListItems={malformedListItems}
            selectedKey={selectedToolKey}
            searchText={search}
            listChanged={listChanged}
            onRefreshList={onRefreshList}
            loadError={loadError}
            pagination={pagination}
            onSearchChange={(value) => onUiChange({ ...ui, search: value })}
            onSelectTool={handleSelectTool}
          />
        </SidebarCard>
      </Sidebar>

      {selectedTool ? (
        // Request and response sit side by side (the redesign prototype): the
        // form is never replaced by its result, so changing one argument and
        // re-running doesn't need a dismiss-and-return trip (#1661 made that
        // trip; this removes it).
        <>
          <ContentPane mah={SCROLL_MAX_HEIGHT}>
            <ContentCard>
              <ToolDetailPanel
                tool={selectedTool}
                // The row key, not the name — a server may list the same tool
                // name twice (#1957), and the panel is reused across selections.
                resetKey={selectedToolKey}
                formValues={formValues}
                isExecuting={isExecuting}
                progress={callState?.progress}
                serverSupportsTaskToolCalls={serverSupportsTaskToolCalls}
                runAsTask={ui.runAsTask}
                shortcutLabel={shortcutLabel}
                onRunAsTaskChange={(value) =>
                  onUiChange({ ...ui, runAsTask: value })
                }
                onFormChange={(values) =>
                  onUiChange({ ...ui, formValues: values })
                }
                onExecute={(runAsTask) => {
                  onUiChange({ ...ui, viewedCallId: undefined });
                  onCallTool(selectedTool.name, formValues, runAsTask);
                }}
                onCancel={() => onCancelCall?.()}
              />
            </ContentCard>
          </ContentPane>
          <ContentPane mah={SCROLL_MAX_HEIGHT}>
            <ResponseCard>
              <ToolResponsePanel
                pending={
                  isExecuting && callState?.toolName === selectedTool.name
                }
                record={viewedRecord}
                history={toolHistory}
                shortcutLabel={shortcutLabel}
                unrecordedError={unrecordedError}
                onSelectRecord={(record) =>
                  onUiChange({
                    ...ui,
                    viewedCallId: record.id,
                    formValues: record.args,
                  })
                }
                onRerun={(record) => {
                  onUiChange({
                    ...ui,
                    viewedCallId: undefined,
                    formValues: record.args,
                  });
                  onCallTool(record.toolName, record.args, record.runAsTask);
                }}
                onReadResource={onReadResource}
              />
            </ResponseCard>
          </ContentPane>
        </>
      ) : (
        // Empty placeholder fills the full screen height (like Prompts/Resources)
        // rather than shrinking to its text.
        <DetailCard flex={1}>
          <EmptyState>Select a tool to view details</EmptyState>
        </DetailCard>
      )}
    </ScreenLayout>
  );
}
