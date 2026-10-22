import { ActionIcon, Menu, Tooltip, VisuallyHidden } from "@mantine/core";
import { RiCheckLine } from "react-icons/ri";
import { TbArrowsSort, TbSortAZ, TbSortZA } from "react-icons/tb";
import type { ToolSortOrder } from "../../../utils/toolUtils";

export interface ToolSortMenuProps {
  value: ToolSortOrder;
  onChange: (next: ToolSortOrder) => void;
}

const OPTIONS: { value: ToolSortOrder; label: string }[] = [
  { value: "server", label: "Server order" },
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
];

const ICONS: Record<ToolSortOrder, typeof TbArrowsSort> = {
  server: TbArrowsSort,
  "name-asc": TbSortAZ,
  "name-desc": TbSortZA,
};

// Sized to sit beside the search input (both `sm`-height controls).
const SortButton = ActionIcon.withProps({
  size: "input-sm",
  "aria-label": "Sort tools",
});

/**
 * The Tools sidebar's sort control: an icon button beside the search box that
 * opens the order choices. The icon names the active order, and the button is
 * filled while a non-default order is applied so a sorted list never reads as
 * the server's own order.
 */
export function ToolSortMenu({ value, onChange }: ToolSortMenuProps) {
  const Icon = ICONS[value];
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        {/* Inline: `label` is required on Tooltip's props, so a `withProps`
            constant baking it in still demands it at the call site. */}
        <Tooltip label="Sort tools" withArrow>
          <SortButton variant={value === "server" ? "default" : "light"}>
            <Icon size={18} />
          </SortButton>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Sort by</Menu.Label>
        {OPTIONS.map((option) => (
          <Menu.Item
            key={option.value}
            onClick={() => onChange(option.value)}
            rightSection={
              option.value === value ? <RiCheckLine aria-hidden /> : null
            }
          >
            {option.label}
            {/* Mantine pins Menu.Item's role to `menuitem`, which takes no
                `aria-checked`, so the current order is named in text. */}
            {option.value === value && (
              <VisuallyHidden> (current)</VisuallyHidden>
            )}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
