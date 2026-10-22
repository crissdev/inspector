import { Alert, Code, Stack, Text } from "@mantine/core";
import { classifyToolCallError } from "./toolResultUtils";

export interface ToolCallErrorPanelProps {
  /** The thrown error's message (already stringified in App). */
  error: string;
  /**
   * The JSON-RPC error code, when the throw was a `ProtocolError`. Under SDK v2
   * an unknown-tool `tools/call` REJECTS with `-32602 Invalid params` instead of
   * resolving an `isError` result, so it arrives here as a thrown error rather
   * than a `CallToolResult` (which the ToolResultPanel would render). The same
   * `-32602` is also thrown for a known tool called with invalid arguments, so
   * the heading/hint are chosen from the message, not the code alone.
   */
  errorCode?: number;
}

const HintText = Text.withProps({
  size: "sm",
  c: "var(--inspector-text-secondary)",
});

const ErrorAlert = Alert.withProps({ color: "red", variant: "light" });

const ERROR_TITLES: Record<string, string> = {
  "unknown-tool": "Unknown Tool",
  "invalid-params": "Invalid Parameters",
  generic: "Tool Error",
};

/**
 * Renders a thrown tool-call error (a protocol/SDK-level rejection) as a
 * distinct error panel. This is separate from ToolResultPanel, which renders a
 * `CallToolResult` (including a tool-level `isError` result). An `-32602`
 * rejection carries no result, so it would otherwise be invisible.
 */
export function ToolCallErrorPanel({
  error,
  errorCode,
}: ToolCallErrorPanelProps) {
  const kind = classifyToolCallError(errorCode, error);
  return (
    <ErrorAlert title={ERROR_TITLES[kind]}>
      <Stack gap="xs">
        <Text size="sm">{error}</Text>
        {kind === "unknown-tool" && (
          <HintText>
            The server rejected this call with <Code>-32602</Code> (Invalid
            params) — it does not recognize this tool. It may have been excluded
            for an invalid <Code>x-mcp-header</Code> annotation or removed since
            the list was last fetched. Try refreshing the tools list.
          </HintText>
        )}
        {kind === "invalid-params" && (
          <HintText>
            The server rejected this call with <Code>-32602</Code> (Invalid
            params). Check the argument values against the tool&apos;s schema.
          </HintText>
        )}
      </Stack>
    </ErrorAlert>
  );
}
