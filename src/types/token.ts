export interface AuthorityState {
  address: string | null;
  status: "active" | "revoked";
}

export interface TokenState {
  network: "solana-mainnet";
  mint: string;
  name: "Green Tree";
  symbol: "GTREE";
  tokenProgram: string;
  standard: "Classic SPL Token";
  decimals: number;
  supplyRaw: string;
  supplyUi: string;
  maximumSupplyUi: string;
  isInitialized: boolean;
  fixedSupplyVerified: boolean;
  mintAuthority: AuthorityState;
  freezeAuthority: AuthorityState;
}
