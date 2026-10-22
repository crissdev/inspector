import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { ReadResourceResult } from "@modelcontextprotocol/client";
import { RiRefreshLine } from "react-icons/ri";
import type { ToolCallRecord } from "../../screens/ToolsScreen/ToolsScreen";
import { ToolResultPanel } from "../ToolResultPanel/ToolResultPanel";
import { ToolCallErrorPanel } from "../ToolResultPanel/ToolCallErrorPanel";
import {
  formatCallClock,
  formatCallDuration,
  summarizeCallArgs,
} from "../../../utils/toolCallHistory";

export interface ToolResponsePanelProps {
  /** A call to this tool is in flight; it takes the body over the record. */
  pending: boolean;
  /** The call whose response is shown, if any. */
  record?: ToolCallRecord;
  /** This tool's completed calls, newest first. */
  history: ToolCallRecord[];
  /** The Execute shortcut label, shown in the empty state. */
  shortcutLabel: string;
  /**
   * An error no history record carries — a step-up auth recovery that failed
   * after the call was handed to it. Shown above the response, since it is
   * newer than anything in the history.
   */
  unrecordedError?: { error: string; errorCode?: number };
  /** Show a past call: its response here, its arguments in the form. */
  onSelectRecord: (record: ToolCallRecord) => void;
  /** Send the same call again — same arguments, same task routing. */
  onRerun: (record: ToolCallRecord) => void;
  onReadResource?: (uri: string) => Promise<ReadResourceResult>;
}

type StatusKey = "pending" | "ok" | "toolError" | "failed" | "cancelled";

const STATUS_BADGES: Record<StatusKey, { label: string; color: string }> = {
  pending: { label: "Running", color: "blue" },
  ok: { label: "OK", color: "green" },
  toolError: { label: "Tool error", color: "red" },
  failed: { label: "Failed", color: "red" },
  cancelled: { label: "Cancelled", color: "gray" },
};

// A result-level `isError` is the tool reporting failure; a record with no
// result at all is the call itself failing (a thrown protocol/SDK error).
function statusOf(record: ToolCallRecord): StatusKey {
  if (record.status === "cancelled") return "cancelled";
  if (record.result?.isError) return "toolError";
  if (record.status === "error") return "failed";
  return "ok";
}

// Header pins at the top, history at the bottom, and the body between them
// takes the remaining height so a long result scrolls inside it.
const PanelStack = Stack.withProps({
  gap: "md",
  flex: 1,
  miw: 0,
  mih: 0,
});

const HeaderRow = Group.withProps({
  justify: "space-between",
  wrap: "nowrap",
  flex: "0 0 auto",
});

const HeaderTitleStack = Stack.withProps({
  gap: 4,
  miw: 0,
});

// Status and timing sit under the title rather than beside it, so a narrow
// column (the monitor panel open) truncates the timing, never the badge.
const StatusRow = Group.withProps({
  gap: "xs",
  wrap: "nowrap",
  miw: 0,
});

// h3 sized as h4, matching ToolResultPanel's "Results" heading.
const PanelTitle = Title.withProps({ order: 3, size: "h4" });

const MetaText = Text.withProps({
  size: "xs",
  c: "dimmed",
  truncate: "end",
});

const RerunButton = Button.withProps({
  size: "xs",
  variant: "light",
  leftSection: <RiRefreshLine />,
});

const Body = Stack.withProps({
  flex: 1,
  mih: 0,
  gap: "md",
});

const PendingRow = Group.withProps({
  gap: "sm",
  py: "xl",
  justify: "center",
});

const EmptyState = Text.withProps({
  c: "dimmed",
  ta: "center",
  py: "xl",
  size: "sm",
});

const CancelledAlert = Alert.withProps({
  color: "gray",
  variant: "light",
  title: "Cancelled",
});

const HistorySection = Stack.withProps({
  gap: "xs",
  flex: "0 0 auto",
});

const HistoryTitle = Text.withProps({
  size: "sm",
  fw: 600,
});

// Caps the history at a few rows so it never crowds the response out; the
// newest calls are on top, so the cut-off ones are the oldest.
const HistoryScroll = ScrollArea.Autosize.withProps({
  mah: 180,
  type: "auto",
  scrollbars: "y",
  offsetScrollbars: true,
});

const HistoryRowLabel = Text.withProps({
  size: "xs",
  ff: "monospace",
  truncate: "end",
});

const HistoryRowDuration = Text.withProps({
  size: "xs",
  c: "dimmed",
});

const StatusPill = Badge.withProps({
  variant: "light",
  size: "sm",
  flex: "0 0 auto",
});

function StatusBadge({ status }: { status: StatusKey }) {
  const { label, color } = STATUS_BADGES[status];
  return <StatusPill color={color}>{label}</StatusPill>;
}

function ResponseBody({
  pending,
  record,
  shortcutLabel,
  onReadResource,
}: Pick<
  ToolResponsePanelProps,
  "pending" | "record" | "shortcutLabel" | "onReadResource"
>) {
  if (pending) {
    return (
      <PendingRow>
        <Loader size="sm" />
        <Text size="sm">Waiting for the server…</Text>
      </PendingRow>
    );
  }
  if (!record) {
    return (
      <EmptyState>
        No calls yet. Execute the tool ({shortcutLabel}) and its response
        appears here, next to the arguments that produced it.
      </EmptyState>
    );
  }
  if (record.result) {
    return (
      <ToolResultPanel result={record.result} onReadResource={onReadResource} />
    );
  }
  if (record.status === "cancelled") {
    return (
      <CancelledAlert>
        The call was cancelled and a cancellation was sent to the server.
      </CancelledAlert>
    );
  }
  return (
    <ToolCallErrorPanel
      error={record.error ?? "The call failed without an error message."}
      errorCode={record.errorCode}
    />
  );
}

/**
 * The right-hand column of the Tools screen: the response to the selected
 * tool's latest (or chosen) call, kept beside the request form instead of
 * replacing it, plus that tool's call history. Re-run repeats the shown call
 * exactly; picking a history row restores its arguments into the form.
 */
export function ToolResponsePanel({
  pending,
  record,
  history,
  shortcutLabel,
  unrecordedError,
  onSelectRecord,
  onRerun,
  onReadResource,
}: ToolResponsePanelProps) {
  const meta = record
    ? `${formatCallDuration(record.durationMs)} · ${formatCallClock(record.startedAt)}`
    : undefined;
  return (
    <PanelStack>
      <HeaderRow>
        <HeaderTitleStack>
          <PanelTitle>Response</PanelTitle>
          {(pending || record) && (
            <StatusRow>
              <StatusBadge
                status={pending || !record ? "pending" : statusOf(record)}
              />
              {!pending && meta && <MetaText>{meta}</MetaText>}
            </StatusRow>
          )}
        </HeaderTitleStack>
        {record && (
          <RerunButton disabled={pending} onClick={() => onRerun(record)}>
            Re-run
          </RerunButton>
        )}
      </HeaderRow>

      <Body>
        {unrecordedError && (
          <ToolCallErrorPanel
            error={unrecordedError.error}
            errorCode={unrecordedError.errorCode}
          />
        )}
        <ResponseBody
          pending={pending}
          record={record}
          shortcutLabel={shortcutLabel}
          onReadResource={onReadResource}
        />
      </Body>

      {history.length > 0 && (
        <HistorySection>
          <Divider />
          <HistoryTitle>History ({history.length})</HistoryTitle>
          <HistoryScroll>
            {history.map((entry) => (
              <NavLink
                key={entry.id}
                active={!pending && entry.id === record?.id}
                onClick={() => onSelectRecord(entry)}
                leftSection={<StatusBadge status={statusOf(entry)} />}
                label={
                  <HistoryRowLabel>
                    {summarizeCallArgs(entry.args)}
                  </HistoryRowLabel>
                }
                description={formatCallClock(entry.startedAt)}
                rightSection={
                  <HistoryRowDuration>
                    {formatCallDuration(entry.durationMs)}
                  </HistoryRowDuration>
                }
              />
            ))}
          </HistoryScroll>
        </HistorySection>
      )}
    </PanelStack>
  );
}
