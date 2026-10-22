import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { CallToolResult } from "@modelcontextprotocol/client";
import {
  renderWithMantine,
  screen,
  waitFor,
} from "../../../test/renderWithMantine";
import { getAceEditor, getAceText } from "../../../test/aceEditor";
import { ToolResultPanel } from "./ToolResultPanel";
import { resultHasResourceLinks } from "./toolResultUtils";

const okResult: CallToolResult = {
  content: [{ type: "text", text: "ok" }],
  isError: false,
};

const errorResult: CallToolResult = {
  content: [{ type: "text", text: "boom" }],
  isError: true,
};

const emptyResult: CallToolResult = { content: [] };

describe("ToolResultPanel", () => {
  it("renders text content blocks", () => {
    renderWithMantine(<ToolResultPanel result={okResult} />);
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders an error alert when isError is true", () => {
    renderWithMantine(<ToolResultPanel result={errorResult} />);
    expect(screen.getByText("Tool Error")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  // #1860: this panel only mounts once a result exists, so an empty result must
  // read as "the call completed and returned nothing" — never as the pre-run
  // "No results yet" placeholder, which denies a call the user watched succeed.
  it("names the outcome when a completed result has no content", () => {
    renderWithMantine(<ToolResultPanel result={emptyResult} />);
    expect(screen.getByText("Empty result")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The tool call completed successfully and returned no content.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("No results yet")).not.toBeInTheDocument();
  });

  it("groups resource_link blocks in a scrollable Resource Links box", async () => {
    const user = userEvent.setup();
    const onReadResource = vi.fn().mockResolvedValue({
      contents: [{ uri: "demo://r/1", text: "linked body" }],
    });
    const result: CallToolResult = {
      content: [
        { type: "text", text: "ok" },
        { type: "resource_link", uri: "demo://r/1", name: "Linked" },
      ],
    };
    renderWithMantine(
      <ToolResultPanel result={result} onReadResource={onReadResource} />,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
    // The link sits inside a grouped, labeled box.
    expect(
      screen.getByRole("heading", { name: "Resource Links" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand resource demo://r/1" }),
    );
    expect(onReadResource).toHaveBeenCalledWith("demo://r/1");
    // The body lands in the read-only JSON editor, whose lines are
    // virtualized — so it is read through the editor, not the DOM.
    await waitFor(() => expect(getAceText()).toContain('"linked body"'));
  });

  it("collapses consecutive resource_link blocks into a single box", () => {
    const result: CallToolResult = {
      content: [
        { type: "text", text: "intro" },
        { type: "resource_link", uri: "demo://r/1", name: "One" },
        { type: "resource_link", uri: "demo://r/2", name: "Two" },
        { type: "resource_link", uri: "demo://r/3", name: "Three" },
      ],
    };
    renderWithMantine(<ToolResultPanel result={result} />);
    // One shared "Resource Links" heading for the whole run of links.
    expect(
      screen.getAllByRole("heading", { name: "Resource Links" }),
    ).toHaveLength(1);
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.getByText("Three")).toBeInTheDocument();
  });

  it("renders a separate Resource Links box per non-adjacent run", () => {
    const result: CallToolResult = {
      content: [
        { type: "resource_link", uri: "demo://r/1", name: "One" },
        { type: "text", text: "divider" },
        { type: "resource_link", uri: "demo://r/2", name: "Two" },
      ],
    };
    renderWithMantine(<ToolResultPanel result={result} />);
    // The text block between the two links splits them into two boxes.
    expect(
      screen.getAllByRole("heading", { name: "Resource Links" }),
    ).toHaveLength(2);
    expect(screen.getByText("divider")).toBeInTheDocument();
  });

  // #2525: the panel's ScrollArea already scrolls a long JSON result, so an
  // Ace editor that also stopped at its row cap and scrolled internally put two
  // vertical scrollbars side by side. The editor grows to full height instead.
  describe("long JSON results (#2525)", () => {
    const longJson = JSON.stringify(
      Array.from({ length: 400 }, (_, id) => ({ id })),
      null,
      2,
    );

    it("lets the JSON editor grow so the panel is the only scroller", () => {
      renderWithMantine(
        <ToolResultPanel
          result={{ content: [{ type: "text", text: longJson }] }}
        />,
      );
      expect(getAceEditor().getOption("maxLines")).toBe(Infinity);
    });

    it("lets it grow inside the capped block beside Resource Links too", () => {
      renderWithMantine(
        <ToolResultPanel
          result={{
            content: [
              { type: "text", text: longJson },
              { type: "resource_link", uri: "demo://r/1", name: "One" },
            ],
          }}
        />,
      );
      expect(getAceEditor().getOption("maxLines")).toBe(Infinity);
    });
  });

  describe("structuredContent (#1908)", () => {
    const structured = { items: [{ id: 1, name: "Item A" }], total: 1 };

    it("renders a Structured Output section alongside the content blocks", () => {
      renderWithMantine(
        <ToolResultPanel
          result={{ ...okResult, structuredContent: structured }}
        />,
      );
      expect(screen.getByText("ok")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Structured Output" }),
      ).toBeInTheDocument();
    });

    it("omits the section when the result has no structuredContent", () => {
      renderWithMantine(<ToolResultPanel result={okResult} />);
      expect(
        screen.queryByRole("heading", { name: "Structured Output" }),
      ).not.toBeInTheDocument();
    });

    it("renders the section instead of the empty state when content is empty", () => {
      renderWithMantine(
        <ToolResultPanel
          result={{ content: [], structuredContent: structured }}
        />,
      );
      expect(screen.queryByText("Empty result")).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Structured Output" }),
      ).toBeInTheDocument();
    });

    it("renders the section below the alert on an error result", () => {
      renderWithMantine(
        <ToolResultPanel
          result={{ ...errorResult, structuredContent: structured }}
        />,
      );
      expect(screen.getByText("Tool Error")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Structured Output" }),
      ).toBeInTheDocument();
    });

    it("renders the section alongside a Resource Links box", () => {
      renderWithMantine(
        <ToolResultPanel
          result={{
            content: [
              { type: "resource_link", uri: "demo://r/1", name: "One" },
            ],
            structuredContent: structured,
          }}
        />,
      );
      expect(
        screen.getByRole("heading", { name: "Resource Links" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Structured Output" }),
      ).toBeInTheDocument();
    });
  });

  it("renders no heading or close button of its own", () => {
    // The Tools response pane owns the heading, status and Re-run; a second
    // "Results" title or an X here would duplicate it.
    renderWithMantine(<ToolResultPanel result={okResult} />);
    expect(screen.queryByRole("heading", { name: "Results" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close results" })).toBeNull();
  });

  describe("resultHasResourceLinks", () => {
    it("is true only for a non-error result containing a resource_link", () => {
      expect(
        resultHasResourceLinks({
          content: [
            { type: "text", text: "ok" },
            { type: "resource_link", uri: "demo://r/1", name: "Linked" },
          ],
        }),
      ).toBe(true);
    });

    it("is false for a text-only result", () => {
      expect(resultHasResourceLinks(okResult)).toBe(false);
    });

    it("is false for an empty result", () => {
      expect(resultHasResourceLinks(emptyResult)).toBe(false);
    });

    it("is false when the result is an error, even with a resource_link", () => {
      expect(
        resultHasResourceLinks({
          isError: true,
          content: [
            { type: "resource_link", uri: "demo://r/1", name: "Linked" },
          ],
        }),
      ).toBe(false);
    });
  });
});
