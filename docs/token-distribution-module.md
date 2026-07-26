# Green Tree Token Distribution Module

This module adds an OWNER-only admin workflow for manual GTREE distributions.

## Fixed Source

- GTREE mint: `AYJ2xXLxNrcJfx7ycgZA6FQnpTSoipdRcCvJPLMadpuJ`
- Source token account: `99hWWmZ27yMy2Ykh6sUdtARuPdkLcTZtSqJXEGncq5zX`
- Source token-account owner: `AZzDWNJQWuvwxwCDXhdHNAnj9dgFXMbD6NMQG851hyY7`
- Existing SPL delegate signer: `D91Bj6xejiB3QQiCJfrbE1c8xRyF1NNnjU2rvE5EVyD9`

The connected admin wallet may only pay SOL fees. It never becomes the GTREE transfer authority.

## Transaction Lifecycle

1. OWNER creates a preview with recipient, exact GTREE amount, category, type and notes.
2. Server derives the recipient Associated Token Account for the official GTREE mint.
3. Server builds a transaction containing only optional idempotent ATA creation and `transferChecked`.
4. Server estimates fees, ATA rent and simulates with signature verification disabled for dry-run preview.
5. Final submission requires `CONFIRM TRANSFER`.
6. In server fee-payer mode, the existing delegate signs and pays fees.
7. In connected-admin fee-payer mode, the server partially signs as delegate, stores a message hash, then the admin wallet signs only the unchanged transaction as fee payer.
8. Backend verifies the signed transaction message hash before any broadcast.
9. Signature is saved immediately before broadcast status reconciliation.

## Configuration

Production must initially use:

```env
GTREE_DISTRIBUTION_ENABLED=false
GTREE_DISTRIBUTION_DRY_RUN=true
GTREE_DISTRIBUTION_FEE_PAYER_MODE=AUTO
GTREE_DISTRIBUTION_ALLOW_CONNECTED_ADMIN_FEE_PAYER=true
```

Real transfers require explicit activation, configured limits, a valid signer, and either enough SOL on the existing delegate signer or a connected OWNER wallet with sufficient SOL.

## Rollback

Disable the module immediately with:

```env
GTREE_DISTRIBUTION_ENABLED=false
GTREE_DISTRIBUTION_DRY_RUN=true
```

Then redeploy or reload PM2 through the existing Green Tree deployment flow.
