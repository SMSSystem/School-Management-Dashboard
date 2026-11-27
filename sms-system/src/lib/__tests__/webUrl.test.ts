import { describe, expect, it } from "vitest";
import { isWebUrl, parseUrl, parseWebUrl } from "../webUrl";

// One place decides what a web address is (lib/webUrl.ts): only http: and https:.

describe("parseWebUrl", () => {
  it("accepts http and https addresses", () => {
    expect(parseWebUrl("https://example.com/a?b=1")?.hostname).toBe(
      "example.com",
    );
    expect(parseWebUrl("http://example.com")?.protocol).toBe("http:");
  });

  it("never accepts anything that runs code, reads data or isn't a web page", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "vbscript:x",
      "file:///etc/passwd",
      "mailto:a@b.com",
      "tel:+18765550000",
      "example.com",
      "",
      "not a url",
    ])
      expect(parseWebUrl(href), href).toBeNull();
  });

  it("resolves a relative address against a base", () => {
    expect(parseWebUrl("/dashboard", "https://app.test/x")?.href).toBe(
      "https://app.test/dashboard",
    );
    expect(parseUrl("/dashboard")).toBeNull();
  });

  it("gives a lookalike hostname in punycode, so its letters from another alphabet show", () => {
    // "exаmple.com" with a Cyrillic "а" (U+0430)
    expect(parseWebUrl("https://exаmple.com/x")?.href).toBe(
      "https://xn--exmple-4nf.com/x",
    );
  });

  it("tells a parsed address's kind", () => {
    expect(isWebUrl(new URL("https://a.test"))).toBe(true);
    expect(isWebUrl(new URL("mailto:a@b.com"))).toBe(false);
  });
});
