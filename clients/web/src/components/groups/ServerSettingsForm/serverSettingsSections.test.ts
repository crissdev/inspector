import { describe, expect, it } from "vitest";
import type { InspectorServerSettings } from "@inspector/core/mcp/types.js";
import { changedSections } from "./serverSettingsSections";

const base: InspectorServerSettings = {
  headers: [{ key: "Authorization", value: "Bearer abc" }],
  env: [],
  metadata: { userId: "u-1" },
  connectionTimeout: 30000,
  requestTimeout: 60000,
  taskTtl: 60000,
  maxFetchRequests: 1000,
  roots: [],
  advertisedExtensions: { a: true, b: false },
};

describe("changedSections", () => {
  it("reports nothing for identical settings", () => {
    expect(changedSections(base, { ...base })).toEqual([]);
  });

  it("names the section each changed field belongs to, in section order", () => {
    expect(
      changedSections(base, {
        ...base,
        roots: [{ uri: "file:///x" }],
        env: [{ key: "TOKEN", value: "1" }],
        requestTimeout: 1,
        protocolEra: "legacy",
        oauthScopes: "read",
        skillCatalogMaxSkills: 5,
      }),
    ).toEqual([
      "options",
      "environment",
      "timeouts",
      "skills",
      "oauth",
      "roots",
    ]);
  });

  it("detects an edit inside a nested value", () => {
    expect(
      changedSections(base, {
        ...base,
        headers: [{ key: "Authorization", value: "Bearer xyz" }],
        metadata: { userId: "u-2" },
      }),
    ).toEqual(["headers", "metadata"]);
  });

  it("ignores object key order, so a toggle undone is not a change", () => {
    expect(
      changedSections(base, {
        ...base,
        advertisedExtensions: { b: false, a: true },
      }),
    ).toEqual([]);
    expect(
      changedSections(base, {
        ...base,
        advertisedExtensions: { a: true, b: true },
      }),
    ).toEqual(["extensions"]);
  });

  it("treats an absent field and an undefined one as the same", () => {
    expect(changedSections(base, { ...base, cwd: undefined })).toEqual([]);
  });

  it("does not badge a field no section edits", () => {
    expect(changedSections(base, { ...base, elicitCapability: "url" })).toEqual(
      [],
    );
  });
});
