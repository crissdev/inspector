import { ActionIcon, Box, Paper } from "@mantine/core";
import { RiDraggable } from "react-icons/ri";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ServerCard, type ServerCardProps } from "../ServerCard/ServerCard";

export type SortableServerCardProps = ServerCardProps;

// The drag-activator grip. `server-drag-handle` carries the grab cursor +
// `:active` pseudo (App.css). `ref`, `aria-label`, and the dnd-kit
// attribute/listener spreads are applied at the call site.
const DragHandle = ActionIcon.withProps({
  variant: "subtle",
  color: "gray",
  size: "md",
  className: "server-drag-handle",
});

/**
 * Sortable wrapper around the dumb `ServerCard`. Owns all drag-and-drop
 * concerns (the `@dnd-kit` sortable node, the per-frame transform, and the
 * grip activator) so `ServerCard` itself stays a pure display component that
 * only renders the `dragHandle` slot it's handed.
 *
 * The grip is the sole drag activator (pointer + keyboard) — bound via
 * `listeners`/`attributes` and `setActivatorNodeRef` — so the card's own
 * buttons (Clone / Edit / Remove / Settings) keep working without starting a
 * drag. It's passed into `ServerCard.dragHandle`, which renders it at the start
 * of the header row, before the server name.
 */
export function SortableServerCard(props: SortableServerCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });

  const grip = (
    <DragHandle
      ref={setActivatorNodeRef}
      aria-label={`Reorder ${props.name}`}
      {...attributes}
      {...listeners}
    >
      <RiDraggable size={16} />
    </DragHandle>
  );

  return (
    <Box
      ref={setNodeRef}
      // dnd-kit positions the item with a transform that changes every
      // animation frame during a drag — the one place an inline style is
      // unavoidable, since the value can't be a static theme variant or prop.
      // While dragging, the card that follows the pointer is the screen's
      // `DragOverlay` (`ServerCardDragPreview`), so this in-list copy stays
      // behind as a faded placeholder marking where the drop will land.
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : undefined,
      }}
    >
      <ServerCard {...props} dragHandle={grip} />
    </Box>
  );
}

// Lifts the preview off the page so it reads as picked up.
const LiftedSurface = Paper.withProps({
  shadow: "xl",
  radius: "md",
  bg: "transparent",
});

/**
 * The card drawn under the pointer while a server is dragged — the content of
 * the screen's `DragOverlay`. It renders the same `ServerCard` with an inert
 * copy of the grip (the real one stays on the in-list placeholder, which keeps
 * the drag's listeners), so the picked-up card looks identical to the one left
 * behind.
 */
export function ServerCardDragPreview(props: SortableServerCardProps) {
  return (
    <LiftedSurface>
      <ServerCard
        {...props}
        dragHandle={
          <DragHandle aria-hidden tabIndex={-1}>
            <RiDraggable size={16} />
          </DragHandle>
        }
      />
    </LiftedSurface>
  );
}
