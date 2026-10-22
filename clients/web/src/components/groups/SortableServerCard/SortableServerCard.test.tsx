import { describe, it, expect, vi } from "vitest";
import type {
  ConnectionState,
  MCPServerConfig,
} from "@inspector/core/mcp/types.js";
import { renderWithMantine, screen } from "../../../test/renderWithMantine";
import {
  ServerCardDragPreview,
  SortableServerCard,
} from "./SortableServerCard";

// Control the dnd-kit sortable state so both arms of the `isDragging`
// opacity ternary are exercised. The real
// `useSortable` only reports `isDragging: true` mid-drag, which can't be
// driven through happy-dom, so we mock it to flip the flag per test.
const sortableMock = vi.hoisted(() => ({ isDragging: false }));
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: sortableMock.isDragging,
  }),
}));

const stdioConfig: MCPServerConfig = {
  command: "npx -y @modelcontextprotocol/server-everything",
};

const connected: ConnectionState = {
  status: "connected",
  protocolVersion: "2025-06-18",
};

const baseProps = {
  id: "srv-1",
  name: "My MCP Server",
  config: stdioConfig,
  info: { name: "My MCP Server", version: "1.2.0" },
  connection: connected,
  onToggleConnection: vi.fn(),
  onConnectionInfo: vi.fn(),
  onSettings: vi.fn(),
  onEdit: vi.fn(),
  onClone: vi.fn(),
  onRemove: vi.fn(),
};

describe("SortableServerCard", () => {
  it("renders the wrapped ServerCard with a reorder grip", () => {
    sortableMock.isDragging = false;
    renderWithMantine(<SortableServerCard {...baseProps} />);
    expect(screen.getByText("My MCP Server")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder My MCP Server" }),
    ).toBeInTheDocument();
  });

  it("leaves a faded placeholder behind while dragging", () => {
    sortableMock.isDragging = true;
    renderWithMantine(<SortableServerCard {...baseProps} />);
    // The card under the pointer is the screen's DragOverlay; the in-list copy
    // fades to mark where the drop will land.
    const card = screen.getByText("My MCP Server");
    const wrapper = card.closest('[style*="opacity"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveStyle({ opacity: "0.35" });
    sortableMock.isDragging = false;
  });
});

describe("ServerCardDragPreview", () => {
  it("renders the card with an inert, hidden copy of the grip", () => {
    renderWithMantine(<ServerCardDragPreview {...baseProps} />);
    expect(screen.getByText("My MCP Server")).toBeInTheDocument();
    // The real grip (with the drag listeners) stays on the placeholder; this
    // one is decoration, kept out of the tab order and the accessibility tree.
    expect(
      screen.queryByRole("button", { name: "Reorder My MCP Server" }),
    ).toBeNull();
    const grip = document.querySelector(".server-drag-handle");
    expect(grip).toHaveAttribute("aria-hidden", "true");
    expect(grip).toHaveAttribute("tabindex", "-1");
  });
});
