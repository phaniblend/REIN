import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cogsCents } from "./cogs";
import { parseInvoiceText } from "./invoice-text";
import { countWindowStart } from "./count-window";
import { convertQty, matchConfidence, sameDish } from "./units";

describe("units", () => {
  it("converts mass and volume", () => {
    assert.equal(convertQty(2, "KG", "G"), 2000);
    assert.equal(convertQty(500, "ML", "L"), 0.5);
    assert.equal(convertQty(1, "KG", "L"), null);
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
