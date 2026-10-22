import { useEffect, useRef, type ReactNode } from "react";
import {
  ActionIcon,
  Card,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import type { IconType } from "react-icons";
import {
  RiDeleteBinLine,
  RiEditLine,
  RiFileCopyLine,
  RiGlobalLine,
  RiInformationLine,
  RiSettings3Line,
  RiTerminalBoxLine,
} from "react-icons/ri";
import type {
  MCPServerConfig,
  ServerEntry,
  ServerType,
} from "@inspector/core/mcp/types.js";
import { ServerStatusIndicator } from "../../elements/ServerStatusIndicator/ServerStatusIndicator";
import { ConnectionToggle } from "../../elements/ConnectionToggle/ConnectionToggle";
import { CopyButton } from "../../elements/CopyButton/CopyButton";
import { CARD_SCROLL_DELAY_MS } from "../../views/InspectorView/monitorColumnAnimation";

export interface ServerCardProps extends ServerEntry {
  activeServer?: string;
  onToggleConnection: (id: string) => void;
  onConnectionInfo: (id: string) => void;
  onSettings: (id: string) => void;
  onEdit: (id: string) => void;
  onClone: (id: string) => void;
  onRemove: (id: string) => void;
  compact?: boolean;
  /**
   * When false (read-only session), the catalog mutation actions
   * (Clone / Edit / Remove / Settings) are hidden; connect and Connection Info
   * remain. Defaults to true.
   */
  writable?: boolean;
  /**
   * Optional drag-handle affordance rendered at the start of the card header,
   * before the server name. Supplied by the sortable wrapper
   * (`SortableServerCard`); omitted when the card is rendered outside a reorder
   * context, so the card stays a dumb display component with no knowledge of
   * drag-and-drop.
   */
  dragHandle?: ReactNode;
  /**
   * When true, the card is freshly added: it draws a green border to draw the
   * eye. Cleared by `onClearHighlight` on any click on the card.
   */
  highlighted?: boolean;
  /**
   * When true, this server's last connection attempt failed: the card draws a
   * red border to flag it (#1621). The parent clears this when another server
   * is connected or a new connection is attempted.
   */
  errored?: boolean;
  /**
   * When true, this server just connected successfully: the card draws the green
   * highlight border and scrolls itself into view once the monitoring sidebar
   * has opened — the success mirror of `errored` (#1682). The parent clears this
   * on disconnect or a new connection attempt.
   */
  justConnected?: boolean;
  /**
   * Whether a highlighted card scrolls itself into view. When several cards are
   * highlighted at once (a batch import) only the first should scroll, so the
   * list jumps to the start of the batch rather than fighting over the viewport.
   * Defaults to true.
   */
  scrollOnHighlight?: boolean;
  /** Called when a highlighted card is clicked, to dismiss the green border. */
  onClearHighlight?: () => void;
}

const HeaderRow = Group.withProps({
  justify: "space-between",
  wrap: "nowrap",
});

const HeaderLeft = Group.withProps({
  gap: "sm",
  wrap: "nowrap",
  miw: 0,
  flex: 1,
});

const HeaderRight = Group.withProps({
  gap: "sm",
  wrap: "nowrap",
});

const ServerName = Text.withProps({
  fw: 600,
  size: "lg",
  truncate: "end",
  miw: 0,
  flex: 1,
});

// The transport as a glyph beside the name: a terminal for stdio, a globe for
// the HTTP transports. Decorative — the footer names the transport in text.
const TransportIcon = ThemeIcon.withProps({
  variant: "light",
  color: "gray",
  size: "md",
  radius: "sm",
  "aria-hidden": true,
});

const TRANSPORT_ICONS: Record<ServerType, IconType> = {
  stdio: RiTerminalBoxLine,
  sse: RiGlobalLine,
  "streamable-http": RiGlobalLine,
};

// The command or URL on one line, on the raised "on-card" code surface, so a
// long command no longer makes every card a tall code block. The full text is
// in the hover title and one click away through the copy button.
const CommandSurface = Paper.withProps({
  px: "sm",
  py: 4,
  radius: "sm",
  bg: "var(--inspector-code-surface)",
});

const CommandRow = Group.withProps({
  gap: "xs",
  wrap: "nowrap",
});

const CommandText = Text.withProps({
  ff: "monospace",
  size: "sm",
  truncate: "end",
  flex: 1,
  miw: 0,
});

const FooterRow = Group.withProps({
  justify: "space-between",
  wrap: "nowrap",
  gap: "sm",
});

// Transport, server version and negotiated protocol as one dimmed line, each
// its own text run so they read (and can be found) separately.
const MetaLine = Group.withProps({
  gap: 6,
  wrap: "nowrap",
  miw: 0,
});

const MetaText = Text.withProps({
  size: "xs",
  c: "dimmed",
  truncate: "end",
});

const MetaSeparator = Text.withProps({
  size: "xs",
  c: "dimmed",
  "aria-hidden": true,
});

const ActionsRow = Group.withProps({
  gap: 2,
  wrap: "nowrap",
});

const IconAction = ActionIcon.withProps({
  variant: "subtle",
  color: "gray",
  size: "md",
});

// `color` drives the subtle hover/active tint; `c` overrides just the glyph to
// the AA-compliant danger red (red.6 alone fell under contrast).
const DangerIconAction = ActionIcon.withProps({
  variant: "subtle",
  color: "red.6",
  c: "var(--inspector-danger-text)",
  size: "md",
});

// Raise the card's command surface to the "on-card" surface — white in light
// mode — mirroring the Protocol/Network `inset` message cards, so it reads as
// raised on the card instead of blending with it. Set as a cascade var on the
// card root, which `CommandSurface` reads.
const CARD_STYLES = {
  root: {
    "--inspector-code-surface": "var(--inspector-surface-code-oncard)",
  },
} as const;

/** One labelled icon action: the label is both the tooltip and the name. */
function CardAction({
  label,
  icon: Icon,
  danger = false,
  onClick,
}: {
  label: string;
  icon: IconType;
  danger?: boolean;
  onClick: () => void;
}) {
  const Action = danger ? DangerIconAction : IconAction;
  return (
    <Tooltip label={label} withArrow>
      <Action aria-label={label} onClick={onClick}>
        <Icon size={16} />
      </Action>
    </Tooltip>
  );
}

function getTransport(config: MCPServerConfig): ServerType {
  return config.type ?? "stdio";
}

const TRANSPORT_DESCRIPTION: Record<ServerType, string> = {
  stdio: "Standard I/O",
  sse: "SSE (Server Sent Events) [deprecated]",
  "streamable-http": "Streamable HTTP",
};

function getCommandOrUrl(config: MCPServerConfig): string {
  if (config.type === "sse" || config.type === "streamable-http") {
    return config.url;
  }
  // Show the full argv for stdio so the card displays the same thing
  // that gets spawned. Otherwise a `command: "npx", args: ["-y", "pkg"]`
  // config renders as just "npx", which is misleading.
  const args = config.args ?? [];
  return args.length > 0
    ? `${config.command} ${args.join(" ")}`
    : config.command;
}

export function ServerCard({
  id,
  name,
  config,
  info,
  connection,
  activeServer,
  onToggleConnection,
  onConnectionInfo,
  onSettings,
  onEdit,
  onClone,
  onRemove,
  compact = false,
  writable = true,
  dragHandle,
  highlighted = false,
  errored = false,
  justConnected = false,
  scrollOnHighlight = true,
  onClearHighlight,
}: ServerCardProps) {
  const isDimmed = activeServer !== undefined && activeServer !== id;
  const rootRef = useRef<HTMLDivElement>(null);

  // When freshly added, bring the card into view (it may be far down a long
  // list). Only the designated card scrolls (the first of a highlighted batch).
  useEffect(() => {
    if (highlighted && scrollOnHighlight) {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted, scrollOnHighlight]);

  // Scroll the failed card into view on the disconnected→errored transition
  // (#1621), deferred past the monitoring sidebar's open (`FAILED_CARD_SCROLL_
  // DELAY_MS`, derived from the column's slide duration) so the grid reflow
  // settles before `scrollIntoView` measures the card. Guarded by a ref so a
  // re-render while still errored doesn't re-scroll and fight the user if they've
  // scrolled away.
  const wasErroredRef = useRef(errored);
  useEffect(() => {
    const justErrored = errored && !wasErroredRef.current;
    wasErroredRef.current = errored;
    if (!justErrored) return;
    const timer = setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, CARD_SCROLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [errored]);

  // Success mirror of the errored scroll (#1682): on the →connected transition,
  // scroll the just-connected card into view, deferred past the monitoring
  // sidebar's open (same shared delay) so the grid reflow settles first. Edge-
  // guarded so a re-render while still connected doesn't re-scroll.
  const wasConnectedRef = useRef(justConnected);
  useEffect(() => {
    const justBecameConnected = justConnected && !wasConnectedRef.current;
    wasConnectedRef.current = justConnected;
    if (!justBecameConnected) return;
    const timer = setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, CARD_SCROLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [justConnected]);
  const transport = getTransport(config);
  const TransportGlyph = TRANSPORT_ICONS[transport];
  const commandOrUrl = getCommandOrUrl(config);
  const version = info?.version;
  const protocolVersion =
    connection.status === "connected" ? connection.protocolVersion : undefined;

  // A dimmed card (another server is active) is inert, so the disabled variant
  // wins; otherwise a failed-connection card draws the red error border, then a
  // freshly-added or just-connected card draws the highlighted green border.
  const variant = isDimmed
    ? "disabled"
    : errored
      ? "errored"
      : highlighted || justConnected
        ? "highlighted"
        : undefined;

  return (
    <Card
      ref={rootRef}
      variant={variant}
      styles={CARD_STYLES}
      onClick={highlighted ? onClearHighlight : undefined}
      {...(isDimmed ? { "aria-disabled": true, inert: true } : {})}
    >
      <Stack gap="sm">
        <HeaderRow>
          <HeaderLeft>
            {dragHandle}
            <TransportIcon>
              <TransportGlyph size={16} />
            </TransportIcon>
            <ServerName>{name}</ServerName>
          </HeaderLeft>
          <HeaderRight>
            <ServerStatusIndicator
              status={connection.status}
              retryCount={connection.retryCount}
              failed={errored}
              // The card has its own width and isn't subject to the header's
              // tab-row crowding, so always show the status label rather than
              // inheriting the header-motivated viewport breakpoint.
              showLabel
            />
            <ConnectionToggle
              status={connection.status}
              disabled={isDimmed}
              onToggle={() => onToggleConnection(id)}
              aria-label={`Connect or disconnect "${name}"`}
            />
          </HeaderRight>
        </HeaderRow>

        {!compact && (
          <>
            <CommandSurface>
              <CommandRow>
                <CommandText title={commandOrUrl}>{commandOrUrl}</CommandText>
                <CopyButton value={commandOrUrl} flush />
              </CommandRow>
            </CommandSurface>

            <FooterRow>
              <MetaLine>
                <MetaText>{TRANSPORT_DESCRIPTION[transport]}</MetaText>
                {version && (
                  <>
                    <MetaSeparator>·</MetaSeparator>
                    <MetaText>{version}</MetaText>
                  </>
                )}
                {protocolVersion && (
                  <>
                    <MetaSeparator>·</MetaSeparator>
                    <MetaText>MCP {protocolVersion}</MetaText>
                  </>
                )}
              </MetaLine>
              <ActionsRow>
                {connection.status === "connected" && (
                  <CardAction
                    label="Connection Info"
                    icon={RiInformationLine}
                    onClick={() => onConnectionInfo(id)}
                  />
                )}
                {writable && (
                  <>
                    <CardAction
                      label="Settings"
                      icon={RiSettings3Line}
                      onClick={() => onSettings(id)}
                    />
                    <CardAction
                      label="Edit"
                      icon={RiEditLine}
                      onClick={() => onEdit(id)}
                    />
                    <CardAction
                      label="Clone"
                      icon={RiFileCopyLine}
                      onClick={() => onClone(id)}
                    />
                    <CardAction
                      label="Remove"
                      icon={RiDeleteBinLine}
                      danger
                      onClick={() => onRemove(id)}
                    />
                  </>
                )}
              </ActionsRow>
            </FooterRow>
          </>
        )}
      </Stack>
    </Card>
  );
}
