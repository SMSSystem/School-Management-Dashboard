import { describe, expect, it } from "vitest";
import {
  PUBLIC_FILES,
  REGISTER_MODULES,
  selectPrecache,
  type ViteManifest,
} from "../serviceWorker/precacheSelection";
import lazyPagesSrc from "../../routes/lazyPages.ts?raw";

// What the service worker keeps on the device (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice E): the
// page, the core app and the two registers, each with what they import statically, and nothing reached only on demand.

const [GENERAL, SUBJECT] = REGISTER_MODULES;

const manifest: ViteManifest = {
  "index.html": {
    file: "assets/index-main.js",
    src: "index.html",
    isEntry: true,
    imports: ["_vendor.js"],
    dynamicImports: [GENERAL, SUBJECT, "src/pdf.tsx"],
    css: ["assets/index-main.css"],
  },
  "_vendor.js": { file: "assets/vendor.js", imports: ["_deep.js"] },
  "_deep.js": { file: "assets/deep.js" },
  [GENERAL]: {
    file: "assets/index-general.js",
    isDynamicEntry: true,
    imports: ["_vendor.js", "_register-shared.js"],
    css: ["assets/general.css"],
  },
  [SUBJECT]: {
    file: "assets/index-subject.js",
    isDynamicEntry: true,
    imports: ["_register-shared.js"],
    dynamicImports: ["src/subjectExtra.tsx"],
  },
  "_register-shared.js": { file: "assets/register-shared.js" },
  "src/subjectExtra.tsx": {
    file: "assets/subject-extra.js",
    isDynamicEntry: true,
  },
  "src/pdf.tsx": {
    file: "assets/pdf.js",
    isDynamicEntry: true,
    imports: ["_pdf-lib.js"],
  },
  "_pdf-lib.js": { file: "assets/pdf-lib.js" },
  "src/components/attendance/OutboxTray.tsx": {
    file: "assets/OutboxTray.js",
    isDynamicEntry: true,
  },
  "node_modules/firebase/database/dist/esm/index.esm.js": {
    file: "assets/index.esm-db.js",
    isDynamicEntry: true,
  },
};

describe("selectPrecache", () => {
  it("keeps the page, the entry and everything it imports statically, with its CSS", () => {
    const keep = selectPrecache(manifest);
    for (const file of [
      "index.html",
      "assets/index-main.js",
      "assets/index-main.css",
      "assets/vendor.js",
      "assets/deep.js",
    ])
      expect(keep.has(file), file).toBe(true);
  });

  it("keeps both registers and what they import", () => {
    const keep = selectPrecache(manifest);
    for (const file of [
      "assets/index-general.js",
      "assets/general.css",
      "assets/index-subject.js",
      "assets/register-shared.js",
    ])
      expect(keep.has(file), file).toBe(true);
  });

  it("keeps what the registers need offline: the unsent-work tray and the database code of the session check", () => {
    const keep = selectPrecache(manifest);
    expect(keep.has("assets/OutboxTray.js")).toBe(true);
    expect(keep.has("assets/index.esm-db.js")).toBe(true);
  });

  it("leaves out everything reached only on demand, such as the PDF code", () => {
    const keep = selectPrecache(manifest);
    for (const file of [
      "assets/pdf.js",
      "assets/pdf-lib.js",
      "assets/subject-extra.js",
    ])
      expect(keep.has(file), file).toBe(false);
  });

  it("keeps the logo and the icons", () => {
    const keep = selectPrecache(manifest);
    for (const file of PUBLIC_FILES) expect(keep.has(file), file).toBe(true);
  });

  it("fails the build when a register or the entry is missing, rather than quietly not working offline", () => {
    const withoutSubject = { ...manifest };
    delete withoutSubject[SUBJECT];
    expect(() => selectPrecache(withoutSubject)).toThrow(
      /not in the build manifest/,
    );
    expect(() =>
      selectPrecache(manifest, [/^node_modules\/nothing\//]),
    ).toThrow(/not in the build manifest/);
    const noEntry = {
      ...manifest,
      "index.html": { ...manifest["index.html"], isEntry: false },
    };
    expect(() => selectPrecache(noEntry)).toThrow(/no entry/);
  });

  it("names the same register modules the app loads", () => {
    expect(lazyPagesSrc).toContain(
      'import("@/scenes/(dashboard)/attendance/general")',
    );
    expect(lazyPagesSrc).toContain(
      'import("@/scenes/(dashboard)/attendance/subject")',
    );
    expect(GENERAL).toBe("src/scenes/(dashboard)/attendance/general/index.tsx");
    expect(SUBJECT).toBe("src/scenes/(dashboard)/attendance/subject/index.tsx");
  });
});
