export type TokenReceiptStatus = "confirmed" | "submitted" | "failed";

export interface TokenReceipt {
  publicId: string;
  distributionId: string | null;
  transactionSignature: string;
  network: "Solana Mainnet";
  tokenMint: string;
  recipientWallet: string;
  recipientTokenAccount: string;
  amountGtree: string;
  amountBaseUnits: string;
  publicDescription: string | null;
  status: TokenReceiptStatus;
  confirmedAt: number | null;
  blockchainSlot: number | null;
  blockchainVerifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
  revokedAt: number | null;
}

export function receiptUrl(publicId: string, origin = "https://gtree.land") {
  return `${origin.replace(/\/+$/, "")}/r/${publicId}`;
}

export function solscanTxUrl(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}

export function isValidReceiptPublicId(value: string) {
  return /^[A-HJ-NP-Z2-9]{10,32}$/.test(value);
}

export function shortenMiddle(value: string, head = 6, tail = 6) {
  return value.length <= head + tail + 3 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}
