/**
 * Which Server Settings section edits which settings field, and which sections
 * an edit has touched. The settings dialog saves as the user types, so this is
 * how it can still say what changed since it opened: each section header shows
 * a "Modified" badge, and Reset knows whether there is anything to undo.
 *
 * Kept beside the form (not in `utils/`) because it is keyed on the form's own
 * `ServerSettingsSection` names, mirroring `clientSettingsValues.ts`.
 */
import type { InspectorServerSettings } from "@inspector/core/mcp/types.js";
import type { ServerSettingsSection } from "./ServerSettingsForm";

type SettingsField = keyof InspectorServerSettings;

export const SECTION_FIELDS = {
  options: [
    "protocolEra",
    "modernLogLevel",
    "autoRefreshOnListChanged",
    "paginatedLists",
    "suppressNotificationStream",
    "maxFetchRequests",
    "cwd",
  ],
  extensions: ["advertisedExtensions"],
  environment: ["env"],
  headers: ["headers"],
  metadata: ["metadata"],
  timeouts: ["connectionTimeout", "requestTimeout", "taskTtl"],
  skills: ["skillCatalogMaxSkills", "skillCatalogMaxBytes"],
  oauth: [
    "oauthClientId",
    "oauthClientSecret",
    "oauthScopes",
    "oauthAuthorizationParams",
    "oauthAuthorizationUrl",
    "oauthTokenUrl",
    "oauthOnInsufficientScope",
    "oauthRequestRefreshToken",
    "oauthRevokeOnClear",
    "enterpriseManaged",
  ],
  roots: ["roots"],
} as const satisfies Record<ServerSettingsSection, readonly SettingsField[]>;

/**
 * Settings fields no section of this dialog edits, so a change to one (made
 * elsewhere, such as by the CLI) never badges a section. Listed rather than
 * left implicit so `UnaccountedSettingsFields` below can require every field
 * to be accounted for: a new setting added to the form without a section here
 * would otherwise never show as modified.
 */
export const UNSECTIONED_FIELDS = [
  "elicitCapability",
] as const satisfies readonly SettingsField[];

type CoveredField =
  | (typeof SECTION_FIELDS)[ServerSettingsSection][number]
  | (typeof UNSECTIONED_FIELDS)[number];

/**
 * Compile-time exhaustiveness: names every settings field that is in neither
 * list above, and fails to type-check unless that set is empty. Adding a field
 * to `InspectorServerSettings` therefore breaks the build here until it is
 * given a section (or listed as unsectioned).
 */
export type UnaccountedSettingsFields = AssertNone<
  Exclude<SettingsField, CoveredField>
>;
type AssertNone<T extends never> = T;

// Settings values are plain JSON (strings, numbers, booleans, arrays and
// objects of them), so serialized equality is exact — once object keys are
// sorted: toggling an extension off and back on re-inserts its key at the end
// of `advertisedExtensions`, which is the same setting in a different order.
// A field that is absent and one that is `undefined` compare equal, which is
// what the omit-when-default persistence of these fields needs.
function canonical(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : v,
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/** The sections whose fields differ between two settings, in section order. */
export function changedSections(
  before: InspectorServerSettings,
  after: InspectorServerSettings,
): ServerSettingsSection[] {
  return (Object.keys(SECTION_FIELDS) as ServerSettingsSection[]).filter(
    (section) =>
      SECTION_FIELDS[section].some(
        (field: SettingsField) => !sameValue(before[field], after[field]),
      ),
  );
}
