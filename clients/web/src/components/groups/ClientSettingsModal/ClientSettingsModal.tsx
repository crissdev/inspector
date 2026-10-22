import { useState } from "react";
import { Button, CloseButton, Group, Modal, ScrollArea } from "@mantine/core";
import { ListToggle } from "../../elements/ListToggle/ListToggle";
import { SecretStorageFooter } from "../../elements/SecretStorageFooter/SecretStorageFooter";
import type { SecretStorageInfo } from "@inspector/core/auth/secret-storage-info.js";
import {
  ClientSettingsForm,
  type ClientSettingsSection,
} from "../ClientSettingsForm/ClientSettingsForm";
import type { EmaIdpLoginState } from "@inspector/core/auth/ema/idpSession.js";
import {
  validateClientSettings,
  type ClientSettingsFormValues,
} from "../ClientSettingsForm/clientSettingsValues.js";

const ALL_SECTIONS: ClientSettingsSection[] = ["ema", "cimd"];

const AppModalLg = Modal.Root.withProps({
  size: "lg",
  centered: true,
  scrollAreaComponent: ScrollArea.Autosize,
});

const ModalHeaderRow = Group.withProps({
  justify: "space-between",
  wrap: "nowrap",
  w: "100%",
});

const CenteredModalTitle = Modal.Title.withProps({
  ta: "center",
  flex: 1,
});

// Save/Cancel pinned under the scrolling body, above the secret-storage band,
// so the actions stay in reach however long the form grows.
const ActionRow = Group.withProps({
  justify: "flex-end",
  gap: "sm",
  px: "md",
  py: "sm",
});

const CancelButton = Button.withProps({ variant: "default" });

function sameSettings(
  a: ClientSettingsFormValues,
  b: ClientSettingsFormValues,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface ClientSettingsModalProps {
  opened: boolean;
  /** The saved settings; the dialog edits a copy taken when it opens. */
  settings: ClientSettingsFormValues;
  /**
   * Close without saving — Cancel, the ✕, Escape and an overlay click all
   * discard the edits made since the dialog opened.
   */
  onClose: () => void;
  /** Persist the edited settings. Only called with complete, valid values. */
  onSave: (settings: ClientSettingsFormValues) => void;
  emaIdpLoginState?: EmaIdpLoginState;
  onEmaIdpLogout?: () => void;
  /**
   * Where secrets typed here end up (#1950). This dialog holds the
   * enterprise IdP client secret, so the footer is not decoration — it is
   * the answer to the question the field raises. Absent on a backend that
   * doesn't report a store; the footer then renders nothing.
   */
  secretStorage?: SecretStorageInfo;
}

export function ClientSettingsModal({
  opened,
  settings,
  onClose,
  onSave,
  emaIdpLoginState,
  onEmaIdpLogout,
  secretStorage,
}: ClientSettingsModalProps) {
  const [expandedSections, setExpandedSections] = useState<
    ClientSettingsSection[]
  >(["ema"]);
  const [revealErrors, setRevealErrors] = useState(false);
  // Edits stay local until Save, so closing any other way discards them. Seeded
  // once: the parent remounts this dialog on every open (its `key`).
  const [draft, setDraft] = useState(settings);
  const dirty = !sameSettings(draft, settings);

  const allExpanded = expandedSections.length === ALL_SECTIONS.length;

  function handleToggleAll() {
    setExpandedSections(allExpanded ? [] : ALL_SECTIONS);
  }

  // A client config that's incomplete (blank required field) or invalid (bad
  // issuer / CIMD URL) would be dropped by the persist gate, so Save reveals the
  // field errors (overriding the form's on-blur gating) and stays open instead
  // of appearing to succeed. Closing is never blocked: it discards the draft.
  function handleSave() {
    const errors = validateClientSettings(draft, { requireComplete: true });
    if (Object.keys(errors).length > 0) {
      setRevealErrors(true);
      return;
    }
    onSave(draft);
  }

  return (
    // Compound Modal so the header lives in `Modal.Header` (sticky by design)
    // while `scrollAreaComponent` confines overflow to `Modal.Body` (#1698 —
    // kept consistent with ServerSettingsModal for when this grows enough to
    // scroll). The fade-down transition `<Modal>` defaults to (but `Modal.Root`
    // doesn't inherit) is supplied app-wide by `ThemeModalRoot`.
    <AppModalLg opened={opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <ModalHeaderRow>
            <ListToggle
              compact={!allExpanded}
              variant="subtle"
              onToggle={handleToggleAll}
            />
            {/* `Modal.Title` names the dialog (wires `aria-labelledby`). */}
            <CenteredModalTitle>Client Settings</CenteredModalTitle>
            <CloseButton aria-label="Close" onClick={onClose} />
          </ModalHeaderRow>
        </Modal.Header>
        <Modal.Body>
          <ClientSettingsForm
            settings={draft}
            expandedSections={expandedSections}
            onExpandedSectionsChange={setExpandedSections}
            // The form reports a value or an updater; `setDraft` takes both.
            onSettingsChange={setDraft}
            emaIdpLoginState={emaIdpLoginState}
            onEmaIdpLogout={onEmaIdpLogout}
            revealErrors={revealErrors}
          />
        </Modal.Body>
        <ActionRow>
          <CancelButton onClick={onClose}>Cancel</CancelButton>
          <Button onClick={handleSave} disabled={!dirty}>
            Save
          </Button>
        </ActionRow>
        <SecretStorageFooter info={secretStorage} />
      </Modal.Content>
    </AppModalLg>
  );
}
