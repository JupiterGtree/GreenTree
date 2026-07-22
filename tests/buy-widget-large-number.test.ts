import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_BUY_INPUT_CHARACTERS,
  formatCompactDecimal,
  validateBuyInput,
} from "../src/lib/market/buy-input";

const root = new URL("../", import.meta.url);
const widgetSource = readFileSync(new URL("src/features/market/buy-widget.tsx", root), "utf8");
const homeGridSource = readFileSync(new URL("src/features/home/buy-and-chart-section.tsx", root), "utf8");
const marketGridSource = readFileSync(new URL("src/app/market/page.tsx", root), "utf8");

test("valid decimal input produces an exact atomic amount and local preview", () => {
  const result = validateBuyInput("1.25", { effectiveGtreePerSol: "2" });
  assert.equal(result.valid, true);
  assert.equal(result.amount?.raw, "1250000000");
  assert.equal(result.previewRaw, "2500000000");
});

test("raw oversized input is rejected by length without producing a preview", () => {
  const raw = "1".repeat(MAX_BUY_INPUT_CHARACTERS + 1);
  const result = validateBuyInput(raw, { effectiveGtreePerSol: "2" });
  assert.equal(raw.length, 33);
  assert.equal(result.code, "length");
  assert.equal(result.previewRaw, null);
});

test("parse validation precedes length validation", () => {
  const result = validateBuyInput("-" + "1".repeat(MAX_BUY_INPUT_CHARACTERS + 1));
  assert.equal(result.code, "parse");
});

test("unsupported numeric spellings and separators are rejected", () => {
  for (const raw of ["-1", "1.2.3", "1e3", "1E3", "Infinity", "-Infinity", "NaN", "1,000", "+1", " 1", "1 "]) {
    assert.equal(validateBuyInput(raw).code, "parse", raw);
  }
});

test("zero and excessive decimal precision fail finite-positive validation", () => {
  assert.equal(validateBuyInput("0").code, "positive");
  assert.equal(validateBuyInput("0.000000000").code, "positive");
  assert.equal(validateBuyInput("1.0000000000").code, "positive");
});

test("maximum purchase validation precedes wallet validation", () => {
  const result = validateBuyInput("2", {
    maxPurchaseLamports: "1000000000",
    spendableLamports: 1n,
  });
  assert.equal(result.code, "maximum");
});

test("wallet spendable validation precedes Foundation inventory validation", () => {
  const result = validateBuyInput("1", {
    spendableLamports: 1n,
    effectiveGtreePerSol: "2",
    foundationInventoryBaseUnits: "1",
  });
  assert.equal(result.code, "wallet");
  assert.equal(result.previewRaw, null);
});

test("Foundation inventory rejects an otherwise valid oversized purchase", () => {
  const result = validateBuyInput("1", {
    spendableLamports: 2_000_000_000n,
    effectiveGtreePerSol: "2",
    foundationInventoryBaseUnits: "1999999999",
  });
  assert.equal(result.code, "inventory");
  assert.equal(result.previewRaw, null);
});

test("compact decimal rendering is bounded and deterministic", () => {
  assert.equal(formatCompactDecimal("150000000", 2), "150M");
  assert.equal(formatCompactDecimal("999.1234", 2), "999.12");
});

test("input preserves pasted text and uses horizontal one-line overflow", () => {
  assert.match(widgetSource, /onChange=\{\(event\) => updateSolInput\(event\.target\.value\)\}/);
  assert.doesNotMatch(widgetSource, /\bmaxLength=/);
  assert.match(widgetSource, /min-w-0 whitespace-nowrap overflow-x-auto/);
  assert.match(widgetSource, /aria-invalid=\{!inputValidation\.valid\}/);
  assert.match(widgetSource, /id="sol-input-validation" className="h-9 min-w-0 overflow-hidden"/);
});

test("preview validation is wallet-independent while invalid review input cannot quote", () => {
  assert.match(widgetSource, /const inputAmount = inputValidation\.amount/);
  assert.match(widgetSource, /const previewRaw = previewInputValidation\.valid \? previewInputValidation\.previewRaw : null/);
  assert.match(widgetSource, /inputAmount &&\s+previewRaw &&/);
  assert.match(widgetSource, /if \(requestBlockReason \|\| !inputAmount/);
});

test("receive output is exact, one-line, and never compacted", () => {
  assert.match(widgetSource, /formatDecimalAmount\(previewOutput, 3\)/);
  assert.doesNotMatch(widgetSource, /≈ \$\{formatCompactDecimal\(previewOutput/);
  assert.match(widgetSource, /truncate whitespace-nowrap/);
  assert.match(widgetSource, /aria-label=\{previewOutputExact/);
  assert.match(widgetSource, /title=\{previewOutputExact/);
  assert.match(widgetSource, /formatUsd\(previewInputUsd\)/);
  assert.match(widgetSource, /formatUsd\(previewOutputUsd\)/);
  assert.match(widgetSource, /formatDecimalAmount\(previewRate, 3\)/);
});

test("rate and inventory rows use fixed shrink-safe columns", () => {
  const fixedRows = widgetSource.match(/grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/g) ?? [];
  assert.ok(fixedRows.length >= 4);
  assert.match(widgetSource, /projectFoundationRemaining\(inventory\.spendableBaseUnits, previewRaw\)/);
  assert.doesNotMatch(widgetSource, /availableFoundationInventoryGtree \|\| 0\) - Number/);
});

test("home cards size independently while both grids prevent overflow", () => {
  assert.match(homeGridSource, /grid min-w-0 items-start/);
  assert.doesNotMatch(homeGridSource, /surface-card h-full/);
  assert.match(marketGridSource, /grid min-w-0 items-stretch/);
  for (const source of [homeGridSource, marketGridSource]) {
    assert.match(source, /grid-cols-\[minmax\(0,/);
    assert.match(source, /min-w-0 overflow-hidden/);
  }
});
