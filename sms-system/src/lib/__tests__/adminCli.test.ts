import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireKeyPath, usageExit } from "../../../scripts/adminCli.mjs";

class Exited extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}

describe("adminCli", () => {
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Exited(code);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("usageExit prints the usage text, then exits with the given code", () => {
    const printUsageAndExit = usageExit("Usage: x");
    expect(() => printUsageAndExit(0)).toThrow(new Exited(0));
    expect(log).toHaveBeenCalledWith("Usage: x");
    expect(() => printUsageAndExit(1)).toThrow(new Exited(1));
  });

  describe("requireKeyPath", () => {
    const required =
      "A service-account key is required: pass --key=<path> or set GOOGLE_APPLICATION_CREDENTIALS.";
    let dir: string;
    let keyFile: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "admin-cli-"));
      keyFile = join(dir, "key.json");
      writeFileSync(keyFile, "{}");
      vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
    });

    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("returns the --key path when the file exists", () => {
      expect(requireKeyPath(keyFile)).toBe(keyFile);
    });

    it("falls back to GOOGLE_APPLICATION_CREDENTIALS", () => {
      vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", keyFile);
      expect(requireKeyPath(null)).toBe(keyFile);
    });

    it("prefers --key over the environment, even if that file is missing", () => {
      vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", keyFile);
      expect(() => requireKeyPath(join(dir, "missing.json"))).toThrow(
        new Exited(1),
      );
    });

    it("exits with 1 when there is no key", () => {
      expect(() => requireKeyPath(null)).toThrow(new Exited(1));
      expect(error).toHaveBeenCalledWith(required);
    });

    it("exits with 1 when the key file is missing", () => {
      expect(() => requireKeyPath(join(dir, "missing.json"))).toThrow(
        new Exited(1),
      );
      expect(error).toHaveBeenCalledWith(required);
    });
  });
});
