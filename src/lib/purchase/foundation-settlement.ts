/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection, PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import type { DbQuote } from "./foundation-direct-db";

export interface SettlementResult {
  status: "PENDING" | "CONFIRMED" | "FAILED" | "EXPIRED";
  reason?: string;
  signature?: string;
  solscanUrl?: string;
}

export async function verifyOnChainSettlement(
  connection: Connection,
  signature: string,
  quoteRecord: DbQuote
): Promise<SettlementResult> {
  try {
    // 1. Fetch signature status first
    const statusResponse = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = statusResponse?.value?.[0];

    if (!status) {
      if (quoteRecord.lastValidBlockHeight !== null && quoteRecord.lastValidBlockHeight !== undefined) {
        const currentBlockHeight = await connection.getBlockHeight("confirmed");
        if (currentBlockHeight > quoteRecord.lastValidBlockHeight) {
          return { status: "FAILED", reason: "Transaction blockhash expired before confirmation." };
        }
      }
      return { status: "PENDING", reason: "Transaction not yet available on-chain." };
    }

    if (status.err) {
      return { status: "FAILED", reason: `On-chain transaction execution failed: ${JSON.stringify(status.err)}` };
    }

    const commitment = status.confirmationStatus;
    if (commitment !== "confirmed" && commitment !== "finalized") {
      return { status: "PENDING", reason: "Transaction is processed but not yet confirmed or finalized." };
    }

    // 3. Fetch full transaction details
    const txResponse = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!txResponse) {
      return { status: "PENDING", reason: "Transaction found in status lookup but details are not yet retrievable." };
    }

    if (txResponse.meta?.err) {
      return { status: "FAILED", reason: "Transaction failed with meta error on-chain." };
    }

    // 4. Calculate SHA-256 hash of on-chain compiled message and verify match
    const onChainMsgBytes = txResponse.transaction.message.serialize();
    const onChainMsgHash = createHash("sha256").update(onChainMsgBytes).digest("hex");

    if (onChainMsgHash !== quoteRecord.transactionMessageHash) {
      return {
        status: "FAILED",
        reason: "Transaction message SHA-256 hash mismatch. The transaction content was modified or spoofed.",
      };
    }

    // 5. Verify transaction fee payer is the buyer
    const accountKeys = txResponse.transaction.message.staticAccountKeys;
    const feePayer = accountKeys[0];
    if (feePayer.toBase58() !== quoteRecord.buyer) {
      return { status: "FAILED", reason: "The buyer is not the transaction fee payer." };
    }

    // 6. Verify buyer matches the quote record
    const storedBuyerPubKey = new PublicKey(quoteRecord.buyer);
    if (!feePayer.equals(storedBuyerPubKey)) {
      return { status: "FAILED", reason: "The transaction fee payer does not match the stored quote buyer." };
    }

    // 7. Verify Treasury SOL transfer amount matches input_lamports
    const treasuryStr = quoteRecord.treasuryRecipient;
    if (!treasuryStr) {
      return { status: "FAILED", reason: "Treasury recipient is not recorded in quote metadata." };
    }
    const treasuryPubKey = new PublicKey(treasuryStr);
    const treasuryIdx = accountKeys.findIndex((key) => key.equals(treasuryPubKey));
    if (treasuryIdx === -1) {
      return { status: "FAILED", reason: "Configured treasury recipient was not found in the transaction." };
    }

    const preBalances = txResponse.meta?.preBalances;
    const postBalances = txResponse.meta?.postBalances;
    if (!preBalances || !postBalances) {
      return { status: "FAILED", reason: "Transaction pre/post SOL balances are missing." };
    }

    const balanceDiff = BigInt(postBalances[treasuryIdx]) - BigInt(preBalances[treasuryIdx]);
    if (balanceDiff !== quoteRecord.inputLamports) {
      return {
        status: "FAILED",
        reason: `Treasury recipient SOL transfer amount mismatch. Expected: ${quoteRecord.inputLamports}, Actual: ${balanceDiff}`,
      };
    }

    // 8. Verify GTREE Token increase in Buyer's ATA and decrease in Foundation Source Account matches output_token_units
    const sourceTokenAccountStr = quoteRecord.saleTokenAccount;
    if (!sourceTokenAccountStr) {
      return { status: "FAILED", reason: "Foundation sale source token account is missing in quote metadata." };
    }
    const sourceTokenAccountPubKey = new PublicKey(sourceTokenAccountStr);

    const mintStr = quoteRecord.gtreeMint;
    if (!mintStr) {
      return { status: "FAILED", reason: "GTREE mint is missing in quote metadata." };
    }

    const preTokenBalances = txResponse.meta?.preTokenBalances;
    const postTokenBalances = txResponse.meta?.postTokenBalances;
    if (!preTokenBalances || !postTokenBalances) {
      return { status: "FAILED", reason: "Transaction pre/post token balances are missing." };
    }

    // Find token balance changes for source account and buyer ATA
    let sourceDecrease = 0n;
    let buyerIncrease = 0n;

    for (const pre of preTokenBalances) {
      const post = postTokenBalances.find((p) => p.accountIndex === pre.accountIndex);
      const accKey = accountKeys[pre.accountIndex];
      const preAmount = BigInt(pre.uiTokenAmount.amount);
      const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;

      if (accKey.equals(sourceTokenAccountPubKey)) {
        sourceDecrease = preAmount - postAmount;
      } else if (pre.mint === mintStr) {
        buyerIncrease = postAmount - preAmount;
      }
    }

    // If buyer ATA was not in preTokenBalances (account did not exist), find it in postTokenBalances
    if (buyerIncrease === 0n) {
      for (const post of postTokenBalances) {
        const accKey = accountKeys[post.accountIndex];
        const pre = preTokenBalances.find((p) => p.accountIndex === post.accountIndex);
        if (!pre && post.mint === mintStr && !accKey.equals(sourceTokenAccountPubKey)) {
          buyerIncrease = BigInt(post.uiTokenAmount.amount);
        }
      }
    }

    if (buyerIncrease !== quoteRecord.outputTokenUnits) {
      return {
        status: "FAILED",
        reason: `Buyer GTREE token increase mismatch. Expected: ${quoteRecord.outputTokenUnits}, Actual: ${buyerIncrease}`,
      };
    }

    if (sourceDecrease !== quoteRecord.outputTokenUnits) {
      return {
        status: "FAILED",
        reason: `Foundation source token decrease mismatch. Expected: ${quoteRecord.outputTokenUnits}, Actual: ${sourceDecrease}`,
      };
    }

    return {
      status: "CONFIRMED",
      signature,
      solscanUrl: `https://solscan.io/tx/${signature}`,
    };
  } catch (error: any) {
    return { status: "FAILED", reason: `Settlement verification threw exception: ${error.message}` };
  }
}
