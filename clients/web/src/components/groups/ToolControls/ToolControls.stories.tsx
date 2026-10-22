import { useState } from "react";
import { noopPagination } from "../../../test/fixtures/pagination";
import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ToolControls } from "./ToolControls";
import { longToolList } from "../../screens/ToolsScreen/ToolsScreen.fixtures";

// ToolControls' search text is controlled by the parent (App, via ToolsScreen —
// see #1417). This wrapper holds that state so the play-driven typing updates
// the controlled input.
function StatefulToolControls(args: ComponentProps<typeof ToolControls>) {
  const [searchText, setSearchText] = useState(args.searchText ?? "");
  const [sortOrder, setSortOrder] = useState(args.sortOrder ?? "server");
  return (
    <ToolControls
      {...args}
      searchText={searchText}
      onSearchChange={setSearchText}
      sortOrder={sortOrder}
      onSortOrderChange={setSortOrder}
    />
  );
}

const meta: Meta<typeof ToolControls> = {
  title: "Groups/ToolControls",
  component: ToolControls,
  args: {
    pagination: noopPagination,
    onRefreshList: fn(),
    onSelectTool: fn(),
    onSearchChange: fn(),
    onSortOrderChange: fn(),
    listChanged: false,
  },
  render: (args) => <StatefulToolControls {...args} />,
};

export default meta;
type Story = StoryObj<typeof ToolControls>;

export const Default: Story = {
  args: {
    tools: longToolList,
  },
};

export const WithSelection: Story = {
  args: {
    tools: longToolList,
    // Row identity is `index:name`, so the selection names the position too.
    selectedKey: "1:query_database",
  },
};

export const WithSearch: Story = {
  args: {
    tools: longToolList,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByPlaceholderText("Search tools..."),
      "git",
    );
  },
};

export const ListChanged: Story = {
  args: {
    tools: longToolList,
    listChanged: true,
  },
};

export const Empty: Story = {
  args: {
    tools: [],
  },
};

// The sort button applies A–Z by shown label (title, else name); the button
// turns filled while the list is in a non-server order.
export const SortedByName: Story = {
  args: {
    tools: longToolList,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Sort tools" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Name (A–Z)" }),
    );
    // Picking an order closes the menu; wait for it so the story settles on
    // the sorted list rather than a dropdown mid-exit.
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());
    await expect(
      canvas.getByRole("button", { name: "Sort tools" }),
    ).toBeInTheDocument();
  },
};
