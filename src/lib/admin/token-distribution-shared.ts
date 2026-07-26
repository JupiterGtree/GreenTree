export const DISTRIBUTION_SOURCE = {
  mint: "AYJ2xXLxNrcJfx7ycgZA6FQnpTSoipdRcCvJPLMadpuJ",
  sourceTokenAccount: "99hWWmZ27yMy2Ykh6sUdtARuPdkLcTZtSqJXEGncq5zX",
  sourceWallet: "AZzDWNJQWuvwxwCDXhdHNAnj9dgFXMbD6NMQG851hyY7",
  delegateSigner: "D91Bj6xejiB3QQiCJfrbE1c8xRyF1NNnjU2rvE5EVyD9",
  decimals: 9,
} as const;

export interface DistributionRecord {
  uuid: string;
  recipientWalletAddress: string;
  recipientTokenAccount: string;
  recipientTokenAccountExisted: boolean;
  amountGtree: string;
  amountBaseUnits: string;
  allocationCategory: string;
  distributionType: string;
  internalNote: string | null;
  publicDescription: string | null;
  externalReference: string | null;
  status: string;
  transactionSignature: string | null;
  feePayerMode: string | null;
  feePayerAddress: string | null;
  estimatedFeeLamports: string | null;
  estimatedAtaRentLamports: string | null;
  estimatedTotalCostLamports: string | null;
  transactionMessageHash: string | null;
  dryRun: boolean;
  failureReason: string | null;
  createdAt: number;
  updatedAt: number;
  receipt: {
    publicId: string;
    publicUrl: string;
    status: "confirmed" | "submitted" | "failed";
    createdAt: number;
    blockchainVerifiedAt: number | null;
    revokedAt: number | null;
  } | null;
}

export interface DistributionDashboard {
  config: {
    enabled: boolean;
    dryRun: boolean;
    feePayerMode: "AUTO" | "SERVER_ONLY" | "CONNECTED_ADMIN_ONLY";
    allowConnectedAdminFeePayer: boolean;
    minSolBalanceLamports: string;
    feeSafetyMarginLamports: string;
    maxPerTransferBaseUnits: string | null;
    dailyLimitBaseUnits: string | null;
  };
  source: {
    mint: string;
    sourceWallet: string;
    sourceTokenAccount: string;
    delegateSigner: string;
    sourceBalanceBaseUnits: string;
    sourceBalanceGtree: string;
    delegatedAmountBaseUnits: string;
    sourceSolLamports: string;
    sourceSol: string;
    serverSignerSolLamports: string;
    serverSignerSol: string;
    signerIsDelegate: boolean;
    signerConfigured: boolean;
    signerMatchesExpected: boolean;
    tokenAccountValid: boolean;
    rpcStatus: "ready" | "error";
    configurationErrors: string[];
  };
  feePayer: {
    selected: "SERVER" | "CONNECTED_ADMIN" | "WAITING";
    serverReady: boolean;
    serverFundingRequired: boolean;
    warning: string | null;
  };
  stats: {
    totalSentTodayBaseUnits: string;
    totalSentMonthBaseUnits: string;
    confirmedTransfers: number;
    pendingTransfers: number;
    failedTransfers: number;
    dailyRemainingBaseUnits: string | null;
    lastSuccessfulTransferAt: number | null;
  };
  recent: DistributionRecord[];
}
