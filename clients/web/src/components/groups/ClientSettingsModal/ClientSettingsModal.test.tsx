import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, screen } from "../../../test/renderWithMantine";
import {
  ClientSettingsModal,
  type ClientSettingsModalProps,
} from "./ClientSettingsModal";
import {
  EMPTY_CLIENT_SETTINGS,
  ISSUER_URL_ERROR,
  CLIENT_ID_REQUIRED_ERROR,
  CLIENT_METADATA_URL_REQUIRED_ERROR,
  type ClientSettingsFormValues,
} from "../ClientSettingsForm/clientSettingsValues";
import { CIMD_METADATA_URL_INVALID_ERROR } from "@inspector/core/client/config-parse.js";

async function expandCimdSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: /OAuth Client ID Metadata Document/i }),
  );
}

function renderModal(props: Partial<ClientSettingsModalProps> = {}) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  renderWithMantine(
    <ClientSettingsModal
      opened
      settings={EMPTY_CLIENT_SETTINGS}
      onClose={onClose}
      onSave={onSave}
      {...props}
    />,
  );
  return { onClose: props.onClose ?? onClose, onSave: props.onSave ?? onSave };
}

const enableEma = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(
    screen.getByRole("checkbox", {
      name: "Enable enterprise IdP configuration",
    }),
  );

const clickSave = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Save" }));

const completeEma: ClientSettingsFormValues = {
  ...EMPTY_CLIENT_SETTINGS,
  emaEnabled: true,
  issuer: "https://idp.test",
  clientId: "client-1",
};

describe("ClientSettingsModal", () => {
  it("renders the title when opened", () => {
    renderModal();
    expect(screen.getByText("Client Settings")).toBeInTheDocument();
  });

  it("shows IdP fields when EMA is enabled", () => {
    renderModal({ settings: { ...EMPTY_CLIENT_SETTINGS, emaEnabled: true } });
    expect(screen.getByLabelText("Issuer")).toBeInTheDocument();
    expect(screen.getByLabelText("IdP Client ID")).toBeInTheDocument();
    expect(screen.getByLabelText("IdP Client Secret")).toBeInTheDocument();
  });

  it("collapses then re-expands all sections via the list toggle", async () => {
    const user = userEvent.setup();
    renderModal();

    // Default: EMA open, CIMD collapsed — toggle offers "Expand all".
    const expand = screen.getByRole("button", { name: "Expand all" });
    expect(expand).toBeInTheDocument();
    expect(
      screen.getByText("Enable enterprise IdP configuration"),
    ).toBeInTheDocument();

    await user.click(expand);
    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(
      screen.getByRole("button", { name: "Collapse all" }),
    ).toBeInTheDocument();
  });

  describe("Save", () => {
    it("is disabled until something changes", async () => {
      const user = userEvent.setup();
      renderModal();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      await enableEma(user);
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
      // Undoing the change makes the draft match the saved settings again.
      await enableEma(user);
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("hands the edited settings to onSave without closing on its own", async () => {
      const user = userEvent.setup();
      const { onSave, onClose } = renderModal({ settings: completeEma });
      await user.type(screen.getByLabelText("IdP Client Secret"), "s3cret");
      await clickSave(user);
      expect(onSave).toHaveBeenCalledWith({
        ...completeEma,
        clientSecret: "s3cret",
      });
      expect(onClose).not.toHaveBeenCalled();
    });

    it("saves a disabled feature even with its fields blank", async () => {
      const user = userEvent.setup();
      const { onSave } = renderModal({
        settings: { ...EMPTY_CLIENT_SETTINGS, emaEnabled: true },
      });
      // Disabling enterprise IdP leaves nothing required.
      await enableEma(user);
      await clickSave(user);
      expect(onSave).toHaveBeenCalledWith(EMPTY_CLIENT_SETTINGS);
    });

    it("reveals the issuer error and does not save an invalid issuer", async () => {
      const user = userEvent.setup();
      const { onSave } = renderModal({
        settings: { ...completeEma, issuer: "https://idp.test" },
      });
      const issuer = screen.getByLabelText("Issuer");
      await user.clear(issuer);
      await user.type(issuer, "not-a-url");
      await clickSave(user);
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText(ISSUER_URL_ERROR)).toBeInTheDocument();

      await user.clear(issuer);
      await user.type(issuer, "https://idp2.test");
      expect(screen.queryByText(ISSUER_URL_ERROR)).not.toBeInTheDocument();
      await clickSave(user);
      expect(onSave).toHaveBeenCalledWith({
        ...completeEma,
        issuer: "https://idp2.test",
      });
    });

    it("reveals the required error when enabling IdP with a blank client ID", async () => {
      const user = userEvent.setup();
      const { onSave } = renderModal();
      await enableEma(user);
      await user.type(screen.getByLabelText("Issuer"), "https://idp.test");
      expect(
        screen.queryByText(CLIENT_ID_REQUIRED_ERROR),
      ).not.toBeInTheDocument();
      await clickSave(user);
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText(CLIENT_ID_REQUIRED_ERROR)).toBeInTheDocument();

      await user.type(screen.getByLabelText("IdP Client ID"), "client-1");
      await clickSave(user);
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("reveals the CIMD errors for a blank and an invalid URL", async () => {
      const user = userEvent.setup();
      const { onSave } = renderModal();
      await expandCimdSection(user);
      await user.click(
        screen.getByRole("checkbox", {
          name: "Use Client ID Metadata Document",
        }),
      );
      await clickSave(user);
      expect(onSave).not.toHaveBeenCalled();
      expect(
        screen.getByText(CLIENT_METADATA_URL_REQUIRED_ERROR),
      ).toBeInTheDocument();

      const url = screen.getByLabelText("Client ID metadata document URL");
      await user.type(url, "not-a-url");
      await clickSave(user);
      expect(onSave).not.toHaveBeenCalled();
      expect(
        screen.getByText(CIMD_METADATA_URL_INVALID_ERROR),
      ).toBeInTheDocument();

      await user.clear(url);
      await user.type(url, "https://example.com/cimd.json");
      await clickSave(user);
      expect(onSave).toHaveBeenCalledWith({
        ...EMPTY_CLIENT_SETTINGS,
        cimdEnabled: true,
        clientMetadataUrl: "https://example.com/cimd.json",
      });
    });
  });

  describe("closing discards the draft", () => {
    // The reported bug: enabling IdP left required fields blank, and every
    // close attempt was refused. Closing must always work.
    it("closes from the ✕ with an incomplete draft, without saving", async () => {
      const user = userEvent.setup();
      const { onClose, onSave } = renderModal();
      await enableEma(user);
      await user.click(screen.getByRole("button", { name: "Close" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
    });

    it("closes from Cancel", async () => {
      const user = userEvent.setup();
      const { onClose, onSave } = renderModal();
      await enableEma(user);
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
    });

    it("closes on Escape", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();
      await enableEma(user);
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("does not render the modal body when closed", () => {
    renderWithMantine(
      <ClientSettingsModal
        opened={false}
        settings={EMPTY_CLIENT_SETTINGS}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByText("Client Settings")).not.toBeInTheDocument();
  });

  describe("secret-storage footer (#1950)", () => {
    // This dialog holds the enterprise IdP client secret, so it states where
    // that secret is about to land — permanently, and beside the field rather
    // than in a startup banner nobody watching this screen ever saw.
    it("names the active store and warns when the file is unencrypted", () => {
      renderWithMantine(
        <ClientSettingsModal
          opened
          settings={EMPTY_CLIENT_SETTINGS}
          onClose={vi.fn()}
          onSave={vi.fn()}
          secretStorage={{
            kind: "file",
            reason: "fallback",
            durable: true,
            plaintext: true,
            path: "/home/node/.mcp-inspector/secrets.json",
          }}
        />,
      );
      // Full-text assertion: the "Secrets:" prefix is its own `<span>`, which
      // `getByText`'s direct-text-node matching would not see as one string.
      const band = screen.getByTestId("secret-storage-footer");
      expect(band).toHaveTextContent(
        "Secrets: Plaintext file. Owner-only permissions.",
      );
      expect(band).toHaveAttribute("data-tone", "warn");
    });

    it("renders no footer when the backend didn't report a store", () => {
      renderWithMantine(
        <ClientSettingsModal
          opened
          settings={EMPTY_CLIENT_SETTINGS}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("secret-storage-footer")).toBeNull();
    });
  });
});
