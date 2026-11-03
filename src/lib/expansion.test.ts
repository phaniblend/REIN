import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cogsCents } from "./cogs";
import { startOfDayInTimezone } from "./digest";
import { parseInvoiceText } from "./invoice-text";
import { countWindowStart } from "./count-window";
import {
  convertInvoiceToStock,
  convertQty,
  matchConfidence,
  sameDish,
  unitFromInvoiceText,
} from "./units";

describe("units", () => {
  it("converts mass and volume", () => {
    assert.equal(convertQty(2, "KG", "G"), 2000);
    assert.equal(convertQty(500, "ML", "L"), 0.5);
    assert.equal(convertQty(1, "KG", "L"), null);
  });

  it("converts invoice lines into the stock unit", () => {
    const converted = convertInvoiceToStock({
      qty: 8000,
      unitPrice: 0.0016,
      fromUnit: "G",
      toUnit: "KG",
    });
    assert.ok(converted);
    assert.equal(converted?.qty, 8);
    assert.ok(Math.abs((converted?.unitCost ?? 0) - 1.6) < 1e-9);
    assert.equal(unitFromInvoiceText("Onion 8000 G 0.0016"), "G");
    assert.equal(
      convertInvoiceToStock({
        qty: 1,
        unitPrice: 1,
        fromUnit: "KG",
        toUnit: "L",
      }),
      null,
    );
  });

  it("treats parenthetical and near-duplicate dish names as the same", () => {
    assert.equal(sameDish("Pani Puri", "Pani Puri (Vegan)"), true);
    assert.equal(sameDish("Chana Masala", "Classic Chana Masala"), true);
    assert.equal(sameDish("Jeera Rice", "Jeera Rice (Cumin Rice)"), true);
    assert.equal(sameDish("Dal", "Dal Makhani"), false);
  });

  it("scores exact names above the auto-map line", () => {
    assert.equal(matchConfidence("Chana Tikka", "chana tikka"), 1);
    assert.ok(matchConfidence("House special", "Dal") < 0.9);
  });
});

describe("invoices", () => {
  it("reads a supplier line and flags a messy one", () => {
    const lines = parseInvoiceText("Onion 8 KG 1.50\nnot a line");
    assert.equal(lines[0]?.name, "Onion");
    assert.equal(lines[0]?.qty, 8);
    assert.equal(lines[0]?.unit, "KG");
    assert.equal(lines[0]?.unitPrice, 1.5);
    assert.ok((lines[1]?.confidence ?? 1) < 0.7);
  });
});

describe("counts", () => {
  it("starts the next count after the previous close", () => {
    const closed = new Date("2026-10-25T18:00:00.000Z");
    assert.equal(countWindowStart(closed).toISOString(), closed.toISOString());
    const first = countWindowStart(null, Date.parse("2026-10-25T18:00:00.000Z"), 16);
    assert.equal(first.toISOString(), "2026-10-25T02:00:00.000Z");
  });
});

describe("books", () => {
  it("turns food-cost percent into cents", () => {
    assert.equal(cogsCents(10000, 32), 3200);
    assert.equal(cogsCents(0, 32), 0);
  });
});

describe("digest day", () => {
  it("starts the Chicago day before UTC midnight crosses", () => {
    // 2026-11-03 02:06 UTC = Nov 2 8:06 PM CST
    const evening = new Date("2026-11-03T02:06:00.000Z");
    const start = startOfDayInTimezone("America/Chicago", evening);
    assert.equal(start.toISOString(), "2026-11-02T06:00:00.000Z");
  });
});
