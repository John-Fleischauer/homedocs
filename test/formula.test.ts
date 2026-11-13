import { describe, expect, it } from "vitest";
import { parseFormula, withHeadings } from "@/lib/parts/formula";

describe("parseFormula", () => {
  it("reads a label with headings, dashes and multi-word colorants", () => {
    const f = parseFormula(`CCE*COLORANT  OZ 32 64 128
B1-Black 2 3 1 1
R2-Maroon - 4 1 1
Y3-Deep Gold - 45 - 1`);
    expect(f).toEqual({
      headings: ["CCE*COLORANT", "OZ", "32", "64", "128"],
      rows: [
        { colorant: "B1-Black", amounts: ["2", "3", "1", "1"] },
        { colorant: "R2-Maroon", amounts: ["", "4", "1", "1"] },
        { colorant: "Y3-Deep Gold", amounts: ["", "45", "", "1"] },
      ],
    });
  });

  it("works without a heading line, padding short rows", () => {
    expect(parseFormula("B1 2 3\nY3 14")).toEqual({
      headings: ["Colorant", "", ""],
      rows: [
        { colorant: "B1", amounts: ["2", "3"] },
        { colorant: "Y3", amounts: ["14", ""] },
      ],
    });
  });

  it("gives up on text that is not a table", () => {
    expect(parseFormula("Ask the store, order 0582820")).toBeNull();
    expect(parseFormula("B1 2 3\nsee the photo")).toBeNull();
    expect(parseFormula("   ")).toBeNull();
  });
});

describe("withHeadings", () => {
  it("starts an empty formula with the headings and a fresh line", () => {
    expect(withHeadings("", "COLORANT OZ 32 64 128")).toBe(
      "COLORANT OZ 32 64 128\n",
    );
  });

  it("goes above rows already typed", () => {
    expect(
      withHeadings("B1 2 3 1 1\nR2 - 4 1 1", "COLORANT OZ 32 64 128"),
    ).toBe("COLORANT OZ 32 64 128\nB1 2 3 1 1\nR2 - 4 1 1");
  });

  it("replaces a heading line instead of stacking another", () => {
    expect(
      withHeadings("CCE*COLORANT OZ 48 96\nB1 2 3", "COLORANT OZ 32 64 128"),
    ).toBe("COLORANT OZ 32 64 128\nB1 2 3");
  });
});
