import { flagSrc } from "./App";

describe("flagSrc", () => {
  test("resolves Ascension Island with AC mapping", () => {
    expect(flagSrc({ name: "Ascension Island", code: "AC" }, 320)).toBe(
      "https://flagcdn.com/w320/ac.png"
    );
  });
});
