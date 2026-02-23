import { resolveFlagImageSrc } from "./flagAssets";

describe("resolveFlagImageSrc", () => {
  it("resolves Ascension Island object payload using AC code", () => {
    expect(
      resolveFlagImageSrc({ name: "Ascension Island", code: "AC" }, 320)
    ).toBe("https://flagcdn.com/w320/ac.png");
  });

  it("resolves Ascension Island name fallback", () => {
    expect(resolveFlagImageSrc("ascension island", 320)).toBe(
      "https://flagcdn.com/w320/ac.png"
    );
  });
});
