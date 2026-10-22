import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { Card, Flex } from "@mantine/core";
import { expect, fn, userEvent, within } from "storybook/test";
import type { ToolCallRecord } from "../../screens/ToolsScreen/ToolsScreen";
import { ToolResponsePanel } from "./ToolResponsePanel";

// Frame the panel in the full-height response card the Tools screen gives it,
// so the history pins to the bottom as it does in the app.
const inCardDecorators: Decorator[] = [
  (Story) => (
    <Flex h={560} w={480} direction="column" align="stretch">
      <Card withBorder padding="lg" variant="preview" flex={1}>
        <Story />
      </Card>
    </Flex>
  ),
];

// A fixed clock so the times read the same on every render.
const AT = new Date(2026, 9, 22, 13, 20, 25).getTime();

function echoCall(
  id: string,
  message: string,
  overrides: Partial<ToolCallRecord> = {},
): ToolCallRecord {
  return {
    id,
    toolName: "echo",
    args: { message },
    runAsTask: false,
    startedAt: AT,
    durationMs: 14,
    status: "ok",
    result: { content: [{ type: "text", text: `Echo: ${message}` }] },
    ...overrides,
  };
}

const latest = echoCall("call-3", "hello again");
const history: ToolCallRecord[] = [
  latest,
  echoCall("call-2", "second call", { startedAt: AT - 42_000 }),
  echoCall("call-1", "hello", { startedAt: AT - 95_000, durationMs: 102 }),
];

const meta: Meta<typeof ToolResponsePanel> = {
  title: "Groups/ToolResponsePanel",
  component: ToolResponsePanel,
  args: {
    pending: false,
    history: [],
    shortcutLabel: "⌘ ↵",
    onSelectRecord: fn(),
    onRerun: fn(),
  },
  decorators: inCardDecorators,
};

export default meta;
type Story = StoryObj<typeof ToolResponsePanel>;

// Before the tool's first call.
export const Empty: Story = {};

// A call in flight: the badge says so and the previous response gives way.
export const Running: Story = {
  args: { pending: true, record: latest, history },
};

// The newest call, with the tool's earlier calls listed below it.
export const WithHistory: Story = {
  args: { record: latest, history },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Re-run/ }));
    await expect(args.onRerun).toHaveBeenCalledWith(latest);
    await userEvent.click(canvas.getByText('message: "hello"'));
    await expect(args.onSelectRecord).toHaveBeenCalledWith(history[2]);
  },
};

// The tool reported failure in its own result (`isError: true`).
export const ToolError: Story = {
  args: {
    record: echoCall("call-1", "boom", {
      status: "error",
      result: {
        isError: true,
        content: [{ type: "text", text: "Upstream service unavailable" }],
      },
    }),
  },
};

// The call itself was rejected, so there is no result — here SDK v2's
// unknown-tool `-32602`, which gets its own heading and hint.
export const Failed: Story = {
  args: {
    record: echoCall("call-1", "hello", {
      status: "error",
      result: undefined,
      error: "MCP error -32602: Tool echo not found",
      errorCode: -32602,
    }),
  },
};

export const Cancelled: Story = {
  args: {
    record: echoCall("call-1", "hello", {
      status: "cancelled",
      result: undefined,
      durationMs: 3_400,
    }),
  },
};

// A step-up auth recovery failed after the call was handed to it: the error
// has no history record, so it sits above the last recorded response.
export const UnrecordedError: Story = {
  args: {
    record: latest,
    history,
    unrecordedError: {
      error: "Authorization was not granted, so the call was not retried.",
    },
  },
};
