import { PublicKey } from "@solana/web3.js";
import {
  LOCALNET_CLUSTER_ID,
  QUOTE_DOMAIN,
  QUOTE_FORMAT_VERSION,
  U64_MAX,
  quoteIdFromBigInt,
  type PurchaseQuote,
} from "./quote.js";

export type SaleQuoteContext = {
  programId: PublicKey;
  saleConfig: PublicKey;
  tokenMint: PublicKey;
  treasuryRecipient: PublicKey;
  configVersion: number;
  maxQuoteAgeSeconds: bigint;
};

export interface ReferencePriceProvider {
  createPurchaseQuote(
    inputLamports: bigint,
    buyer: PublicKey,
    saleConfig: SaleQuoteContext,
  ): Promise<PurchaseQuote>;
}

export class MockReferencePriceProvider implements ReferencePriceProvider {
  private quoteCounter: bigint;

  constructor(
    private readonly tokenBaseUnitsPerLamportNumerator = 1_000n,
    private readonly tokenBaseUnitsPerLamportDenominator = 1n,
    private readonly minimumOutputBps = 9_900n,
    initialQuoteCounter = 1n,
  ) {
    if (tokenBaseUnitsPerLamportNumerator <= 0n || tokenBaseUnitsPerLamportDenominator <= 0n) {
      throw new RangeError("mock reference-price ratio must be positive");
    }
    this.quoteCounter = initialQuoteCounter;
  }

  async createPurchaseQuote(
    inputLamports: bigint,
    buyer: PublicKey,
    saleConfig: SaleQuoteContext,
  ): Promise<PurchaseQuote> {
    const output = inputLamports * this.tokenBaseUnitsPerLamportNumerator
      / this.tokenBaseUnitsPerLamportDenominator;
    const minimumOutput = output * this.minimumOutputBps / 10_000n;
    if (inputLamports < 0n || output > U64_MAX || minimumOutput > U64_MAX) {
      throw new RangeError("mock quote amount is outside the supported u64 range");
    }
    const now = BigInt(Math.floor(Date.now() / 1_000));
    const lifetime = saleConfig.maxQuoteAgeSeconds < 120n
      ? saleConfig.maxQuoteAgeSeconds
      : 120n;
    const quote: PurchaseQuote = {
      domain: Uint8Array.from(QUOTE_DOMAIN),
      quoteFormatVersion: QUOTE_FORMAT_VERSION,
      clusterId: LOCALNET_CLUSTER_ID,
      configVersion: saleConfig.configVersion,
      programId: saleConfig.programId,
      saleConfig: saleConfig.saleConfig,
      tokenMint: saleConfig.tokenMint,
      treasuryRecipient: saleConfig.treasuryRecipient,
      buyer,
      inputLamports,
      outputTokenBaseUnits: output,
      minimumOutputTokenBaseUnits: minimumOutput,
      issuedAt: now - 1n,
      expiry: now + lifetime,
      quoteId: quoteIdFromBigInt(this.quoteCounter++),
    };
    return quote;
  }
}
