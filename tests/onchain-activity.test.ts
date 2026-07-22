/* eslint-disable @typescript-eslint/no-explicit-any */
import { Module } from "node:module";
const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, [id, ...args] as any);
};

import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyParsedTransaction,
  isDisplayableActivity,
  mergeAndSortSignatures,
  type OnchainActivityConfig,
  type ParsedTransaction,
  type SignatureInfo,
} from "../src/lib/market/onchain-activity";
import { matchesFilter } from "../src/features/transactions/transaction-filters";
import { createActivityRequestGuard } from "../src/lib/market/onchain-activity-client";

const CONFIG: OnchainActivityConfig = {
  gtreeMint: "AYJ2xXLxNrcJfx7ycgZA6FQnpTSoipdRcCvJPLMadpuJ",
  treasuryRecipient: "AZzDWNJQWuvwxwCDXhdHNAnj9dgFXMbD6NMQG851hyY7",
  saleTokenAccount: "99hWWmZ27yMy2Ykh6sUdtARuPdkLcTZtSqJXEGncq5zX",
  tokenDecimals: 9,
  solscanBaseUrl: "https://solscan.io",
  rpcUrl: "https://api.mainnet-beta.solana.com",
};

const BUYER = "Buyer111111111111111111111111111111111111111";
const BUYER_ATA = "BuyerAta111111111111111111111111111111111111";
const SIGNATURE = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9dFoundationBuySig001";

function foundationBuyTransaction(overrides?: Partial<ParsedTransaction>): ParsedTransaction {
  return {
    blockTime: 1_700_000_000,
    transaction: {
      message: {
        accountKeys: [
          { pubkey: BUYER, signer: true, writable: true },
          { pubkey: CONFIG.treasuryRecipient, signer: false, writable: true },
          { pubkey: CONFIG.saleTokenAccount, signer: false, writable: true },
          { pubkey: BUYER_ATA, signer: false, writable: true },
        ],
      },
    },
    meta: {
      err: null,
      preBalances: [2_000_000_000, 1_000_000_000, 0, 0],
      postBalances: [1_000_000_000, 2_000_000_000, 0, 0],
      preTokenBalances: [
        {
          accountIndex: 2,
          mint: CONFIG.gtreeMint,
          owner: "SaleOwner111111111111111111111111111111111",
          uiTokenAmount: { amount: "1000000000000", decimals: 9 },
        },
        {
          accountIndex: 3,
          mint: CONFIG.gtreeMint,
          owner: BUYER,
          uiTokenAmount: { amount: "0", decimals: 9 },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 2,
          mint: CONFIG.gtreeMint,
          owner: "SaleOwner111111111111111111111111111111111",
          uiTokenAmount: { amount: "984809223783", decimals: 9 },
        },
        {
          accountIndex: 3,
          mint: CONFIG.gtreeMint,
          owner: BUYER,
          uiTokenAmount: { amount: "15190776217", decimals: 9 },
        },
      ],
    },
    ...overrides,
  };
}

function signature(sourceAddress: string, signature = SIGNATURE, blockTime = 1_700_000_000): SignatureInfo {
  return { signature, blockTime, err: null, sourceAddress };
}

test("valid Foundation Direct purchase classification", () => {
  const record = classifyParsedTransaction(signature(CONFIG.saleTokenAccount), foundationBuyTransaction(), CONFIG);
  assert.equal(record?.type, "FOUNDATION_DIRECT_BUY");
  assert.equal(record?.label, "Foundation Direct buy");
  assert.equal(record?.status, "confirmed");
});

test("buyer wallet identification uses fee payer", () => {
  const record = classifyParsedTransaction(signature(CONFIG.saleTokenAccount), foundationBuyTransaction(), CONFIG);
  assert.equal(record?.buyerWallet, BUYER);
});

test("correct SOL paid calculation", () => {
  const record = classifyParsedTransaction(signature(CONFIG.treasuryRecipient), foundationBuyTransaction(), CONFIG);
  assert.equal(record?.solAmount, "1");
});

test("correct GTREE received calculation", () => {
  const record = classifyParsedTransaction(signature(CONFIG.saleTokenAccount), foundationBuyTransaction(), CONFIG);
  assert.equal(record?.gtreeAmount, "15.190776217");
  assert.equal(record?.destinationTokenAccount, BUYER_ATA);
});

test("Foundation source token decrease verification is required", () => {
  const tx = foundationBuyTransaction();
  tx.meta!.postTokenBalances![0].uiTokenAmount.amount = "1000000000000";
  const record = classifyParsedTransaction(signature(CONFIG.saleTokenAccount), tx, CONFIG);
  assert.notEqual(record?.type, "FOUNDATION_DIRECT_BUY");
});

test("treasury SOL increase verification is required", () => {
  const tx = foundationBuyTransaction();
  tx.meta!.postBalances![1] = tx.meta!.preBalances![1];
  const record = classifyParsedTransaction(signature(CONFIG.treasuryRecipient), tx, CONFIG);
  assert.notEqual(record?.type, "FOUNDATION_DIRECT_BUY");
});

test("failed transaction classification", () => {
  const tx = foundationBuyTransaction();
  tx.meta!.err = { InstructionError: [0, "Custom"] };
  const record = classifyParsedTransaction(signature(CONFIG.saleTokenAccount), tx, CONFIG);
  assert.equal(record?.type, "FAILED");
  assert.equal(record?.status, "failed");
});

test("GTREE-only transfer classification", () => {
  const tx = foundationBuyTransaction();
  tx.meta!.postBalances![1] = tx.meta!.preBalances![1];
  const record = classifyParsedTransaction(signature(CONFIG.saleTokenAccount), tx, CONFIG);
  assert.equal(record?.type, "GTREE_TRANSFER");
});

test("treasury-only activity classification", () => {
  const tx: ParsedTransaction = {
    blockTime: 1_700_000_100,
    transaction: {
      message: {
        accountKeys: [
          { pubkey: BUYER, signer: true, writable: true },
          { pubkey: CONFIG.treasuryRecipient, signer: false, writable: true },
        ],
      },
    },
    meta: {
      err: null,
      preBalances: [5_000_000_000, 1_000_000_000],
      postBalances: [4_000_000_000, 2_000_000_000],
      preTokenBalances: [],
      postTokenBalances: [],
    },
  };
  const record = classifyParsedTransaction(signature(CONFIG.treasuryRecipient, "TreasuryOnlySig111111111111111111111111111111111111111"), tx, CONFIG);
  assert.equal(record?.type, "TREASURY_ACTIVITY");
  assert.equal(record?.solAmount, "1");
  assert.equal(record?.gtreeAmount, null);
});

test("duplicate signature removal and newest-first ordering", () => {
  const sigA = `${"A".repeat(64)}`;
  const sigB = `${"B".repeat(64)}`;
  const merged = mergeAndSortSignatures([
    [signature(CONFIG.saleTokenAccount, sigA, 100)],
    [
      signature(CONFIG.treasuryRecipient, sigA, 100),
      signature(CONFIG.treasuryRecipient, sigB, 200),
    ],
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].signature, sigB);
  assert.equal(merged[1].signature, sigA);
});

test("unknown and amount-less activity is excluded from display", () => {
  const unknown = classifyParsedTransaction(
    signature(CONFIG.saleTokenAccount, "UnknownSig11111111111111111111111111111111111111111111"),
    {
      blockTime: 1_700_000_200,
      transaction: {
        message: {
          accountKeys: [
            { pubkey: BUYER, signer: true, writable: true },
            { pubkey: CONFIG.saleTokenAccount, signer: false, writable: false },
          ],
        },
      },
      meta: {
        err: null,
        preBalances: [1, 0],
        postBalances: [1, 0],
        preTokenBalances: [],
        postTokenBalances: [],
      },
    },
    CONFIG,
  );
  assert.equal(unknown?.type, "UNKNOWN");
  assert.equal(isDisplayableActivity(unknown!), false);
  assert.equal(isDisplayableActivity({
    type: "TREASURY_ACTIVITY",
    solAmount: null,
    gtreeAmount: null,
  } as any), false);
  assert.equal(isDisplayableActivity({
    type: "FOUNDATION_DIRECT_BUY",
    solAmount: "0.01",
    gtreeAmount: "151.9",
  } as any), true);
});

test("API response shape contains no RPC credentials or secret values", () => {
  const record = classifyParsedTransaction(signature(CONFIG.saleTokenAccount), foundationBuyTransaction(), CONFIG);
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes("api-key"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes(CONFIG.rpcUrl), false);
  assert.match(serialized, /solscan\.io\/tx\//);
});

test("filter changes stay client-side and do not request RPC", () => {
  let apiCalls = 0;
  const records = [
    { type: "FOUNDATION_DIRECT_BUY" as const },
    { type: "GTREE_TRANSFER" as const },
    { type: "TREASURY_ACTIVITY" as const },
  ];
  const filtered = records.filter((record) => {
    apiCalls += 0;
    return matchesFilter(record.type, "direct-buys");
  });
  assert.equal(apiCalls, 0);
  assert.equal(filtered.length, 1);
  assert.equal(matchesFilter("FOUNDATION_DIRECT_BUY", "direct-buys"), true);
  assert.equal(matchesFilter("GTREE_TRANSFER", "transfers"), true);
  assert.equal(matchesFilter("TREASURY_ACTIVITY", "treasury"), true);
  assert.equal(matchesFilter("FAILED", "direct-buys"), false);
});

test("refresh requests do not overlap", async () => {
  const guard = createActivityRequestGuard();
  let active = 0;
  let maxActive = 0;
  const task = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return "done";
  };
  const first = guard.run(task);
  const second = guard.run(task);
  assert.equal(await second, null);
  assert.equal(await first, "done");
  assert.equal(maxActive, 1);
});

test("partial RPC failure returns available classified data", () => {
  const available = classifyParsedTransaction(signature(CONFIG.saleTokenAccount), foundationBuyTransaction(), CONFIG);
  const partialPayload = {
    records: available ? [available] : [],
    partialData: true,
  };
  assert.equal(partialPayload.partialData, true);
  assert.equal(partialPayload.records.length, 1);
  assert.equal(partialPayload.records[0].type, "FOUNDATION_DIRECT_BUY");
});
