import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "solana/foundation-sale/**",
    // Local operational diagnostics and explicitly manual Mainnet scripts are
    // not part of the application or deterministic test suite.
    "tests/check-*.ts",
    "tests/discover-mainnet-accounts*.ts",
    "tests/find-solana-keys.ts",
    "tests/list-all-raw.ts",
    "tests/print-authority-pubkey.ts",
    "tests/search-all-d-drive.ts",
    "tests/simulate-purchase-mainnet.ts",
    "tests/server-only-shim.cjs",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
