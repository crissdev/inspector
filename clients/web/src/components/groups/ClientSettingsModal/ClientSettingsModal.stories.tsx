import { AppShell } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  ClientSettingsModal,
  type ClientSettingsModalProps,
} from "./ClientSettingsModal";
import type { ClientSettingsFormValues } from "../ClientSettingsForm/clientSettingsValues";

const configuredSettings: ClientSettingsFormValues = {
  emaEnabled: true,
  issuer: "https://idp.example.com",
  clientId: "inspector-idp-client",
  clientSecret: "super-secret-idp-value",
  cimdEnabled: true,
  clientMetadataUrl: "https://example.com/oauth/client.json",
};

// The dialog edits its own draft and only reports on Save, so the story needs
// no arg syncing — just the AppShell the real dialog opens over.
function InteractiveRender(args: ClientSettingsModalProps) {
  return (
    <AppShell>
      <AppShell.Main>
        <ClientSettingsModal {...args} />
      </AppShell.Main>
    </AppShell>
  );
}

const meta: Meta<typeof ClientSettingsModal> = {
  title: "Groups/ClientSettingsModal",
  component: ClientSettingsModal,
  parameters: { layout: "fullscreen" },
  render: InteractiveRender,
  args: {
    opened: true,
    onClose: fn(),
    onSave: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ClientSettingsModal>;

export const Configured: Story = {
  args: {
    settings: configuredSettings,
  },
};

export const Empty: Story = {
  args: {
    settings: {
      emaEnabled: false,
      issuer: "",
      clientId: "",
      clientSecret: "",
      cimdEnabled: false,
      clientMetadataUrl: "",
    },
  },
};

export const EnabledEmptyFields: Story = {
  args: {
    settings: {
      emaEnabled: true,
      issuer: "",
      clientId: "",
      clientSecret: "",
      cimdEnabled: false,
      clientMetadataUrl: "",
    },
  },
};

// Enabling enterprise IdP with its required fields blank: Save reveals the
// errors and stays open, while Cancel (or ✕ / Escape) still closes.
export const SaveRevealsErrors: Story = {
  args: {
    settings: {
      emaEnabled: false,
      issuer: "",
      clientId: "",
      clientSecret: "",
      cimdEnabled: false,
      clientMetadataUrl: "",
    },
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("checkbox", {
        name: "Enable enterprise IdP configuration",
      }),
    );
    await userEvent.click(body.getByRole("button", { name: "Save" }));
    await expect(
      body.getByText(
        "Issuer is required when enterprise IdP configuration is enabled",
      ),
    ).toBeInTheDocument();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};
