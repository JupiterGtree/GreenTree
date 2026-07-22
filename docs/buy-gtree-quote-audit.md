# Buy GTREE quote and purchase audit

Date: 2026-07-18  
Scope: homepage and Market-page `BuyWidget`, server quote normalization, wallet-balance state, and swap preparation.

## Verified identifiers

| Item | Verified value |
| --- | --- |
| Network | Solana Mainnet |
| Input mint | Wrapped SOL — `So11111111111111111111111111111111111111112` |
| Output mint | GTREE — `AYJ2xXLxNrcJfx7ycgZA6FQnpTSoipdRcCvJPLMadpuJ` |
| Meteora pool | `4EfPeDK4XEfpBXDsu6NwHTaGqh3CzPPT6jCemU5FeWJE` |
| SOL decimals | 9 |
| GTREE decimals | 9 |

## Authoritative references

- Jupiter Metis quote contract: https://developers.jup.ag/docs/swap/v1/get-quote
- Jupiter custom-swap safety guidance: https://developers.jup.ag/docs/guides/how-to-build-a-custom-swap-with-metis
- Solana parsed token amount structure: https://solana.com/docs/rpc/json-structures

Jupiter defines `amount` as the raw input amount before decimals. It also defines `priceImpactPct` as a decimal fraction from 0 to 1: `0.01` means 1%, and `1` means 100%. Jupiter warns that `onlyDirectRoutes=true` can return an unfavorable quote when the only direct market is illiquid.

## Quote pipeline traced

1. The UI accepts a decimal SOL string.
2. The string is validated against a maximum of 9 decimal places. Negative values, exponent notation and invalid characters are rejected.
3. The validated value is converted to lamports with `BigInt`; no floating-point value is used for the raw request.
4. `/api/market/quote` passes the exact decimal string to the server quote service.
5. Jupiter receives Wrapped SOL as `inputMint`, GTREE as `outputMint`, `ExactIn`, the exact raw input amount, the selected slippage and a direct-route restriction.
6. The response is rejected unless `inAmount`, both mints, slippage, pool address, route direction and positive raw output values match the request.
7. GTREE raw output and minimum-received amounts are converted with `BigInt` and 9 decimals.
8. Jupiter's fractional `priceImpactPct` is multiplied by 100 before display or safety evaluation.
9. SOL/USD and GTREE/USD reference values are derived from the verified Meteora pool response when available. Input and output USD values are calculated separately.
10. The client accepts the response only when it matches the latest input raw amount and request parameters and has not expired.
11. A 15-second local freshness window begins when the Jupiter quote is received, not when later USD enrichment finishes.
12. Swap preparation re-quotes on the server, enforces the website price-impact limit and rejects a route whose new output is below the minimum the user reviewed.

## Root causes found

### 1. The apparent output cap was real pool exhaustion

The live Meteora pool reported approximately:

- `3430.420850727 GTREE`
- `0.224258011 SOL`

Large ExactIn purchases therefore approach the pool's entire GTREE reserve. Jupiter confirmed the exact requested input for every audited amount; neither the client nor Jupiter capped the input.

### 2. Price impact was displayed with the wrong unit

The API returned `priceImpactPct: "1"`. The previous implementation displayed this as `1.00%`. Jupiter documents this field as a decimal fraction, so the correct display is `100.00%`. This was the most serious safety defect.

### 3. Raw SOL conversion used floating-point arithmetic

The previous implementation used `Math.round(inputSol * 10 ** 9)`. It was correct for the tested simple values but was not decimal-safe for all valid 9-decimal inputs. The request path now uses a validated decimal string and `BigInt`.

### 4. Older requests could overwrite newer input

The former debounced request had neither cancellation nor a sequence guard. A slower request for `1 SOL` could overwrite a newer `10 SOL` or `100 SOL` input. Requests are now aborted on input/slippage change and the response sequence is verified before state is updated.

### 5. Stale output remained visible while a new amount was loading

The previous quote stayed visible until the replacement request completed. Quote, USD and risk data are now cleared immediately when the input or slippage changes, and the output explicitly enters a refreshing state.

### 6. The USD comparison showed only the output side

The former UI multiplied GTREE output by the spot reference price but did not show the input SOL value. This hid the scale of the route loss. The component now shows input market value, estimated output value, absolute reference-value loss and percentage loss.

### 7. Wallet balance zero was ambiguous

The wallet context initialized a connected wallet with `0 SOL` before the RPC response and retained that presentation when the balance request failed. Balance state is now explicit: loading, verified, or unavailable. Insufficient-balance warnings are emitted only for a connected wallet with a successfully loaded balance.

### 8. Website execution had no server-side impact limit

The previous Review action could prepare a transaction regardless of extreme impact. Both UI and `/api/market/swap` now block price impact above 15%. The server also re-checks the reviewed minimum output.

## Live request examples

All examples used 1% max slippage, the confirmed Wrapped SOL input mint, GTREE output mint and the confirmed Meteora DAMM v2 pool.

| Input SOL | Requested raw lamports | Jupiter response `inAmount` | GTREE output | Jupiter impact | Input USD | Output USD | Reference-value loss |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.01 | 10,000,000 | 10,000,000 | 146.071620018 | 100% | $0.7485 | $0.7147 | 4.51% |
| 0.1 | 100,000,000 | 100,000,000 | 1,055.284564609 | 100% | $7.4849 | $5.1636 | 31.01% |
| 1 | 1,000,000,000 | 1,000,000,000 | 2,795.035647902 | 100% | $74.8488 | $13.6764 | 81.73% |
| 10 | 10,000,000,000 | 10,000,000,000 | 3,346.790342196 | 100% | $748.4877 | $16.3762 | 97.81% |
| 100 | 100,000,000,000 | 100,000,000,000 | 3,414.188207847 | 100% | $7,484.8767 | $16.7060 | 99.78% |

USD values are observations from the audit run and will change with SOL and pool prices. They are not fallback values.

## Fixes applied

- Added decimal-string-to-atomic `BigInt` conversion and exact raw-amount validation.
- Added client request cancellation and monotonically increasing sequence protection.
- Clear all quote-derived values immediately on amount/slippage changes.
- Validate request/response amount, mints, route, pool, output, slippage, network and expiry.
- Corrected Jupiter impact from fractional form to displayed percent.
- Added separate input/output USD values and route-loss calculation.
- Added Normal, Noticeable, High and Extreme impact severity handling.
- Require confirmation for high impact; block website execution above 15% in both UI and server route.
- Added explicit wallet balance loading/error/ready state and a 0.005 SOL fee reserve for spendable balance.
- Added honest disconnected and unavailable balance copy.
- Replaced the nested-card layout with one outer glass surface, tonal conversion area, compact slippage controls, summary strip and expandable details.
- Added typed, server-controlled `websiteBonus` output. It remains `null`; no bonus is displayed or distributed without a future verified server implementation.
- Changed action wording from “Review swap” to “Review purchase”.

## Test results

| Test | Result |
| --- | --- |
| Disconnected wallet | Pass — balance is not shown as zero; primary action is Connect wallet |
| Wallet balance loading/failure | Pass by state-path review — no insufficient warning until a verified balance exists |
| On-chain wallet balance endpoint | Pass — raw lamports and UI balances remain distinct |
| 0.01 / 0.1 / 1 / 10 / 100 SOL | Pass — request and response raw input amounts match exactly; outputs shown above |
| Rapid `1 → 10 → 100` input | Pass — old output cleared immediately; only the 100 SOL response was rendered |
| Invalid input (`-1`, `1e2`, `abc`) | Pass — HTTP 422, no quote |
| More than 9 decimals | Pass — HTTP 422, no quote |
| Quote expiry | Pass — output, USD and action eligibility are cleared at expiry |
| Extreme impact | Pass — 100% is shown and website transaction preparation is blocked |
| Server-side swap guard | Pass — `/api/market/swap` returned HTTP 422 for the current extreme route |
| Route/mint/raw amount validation | Pass by targeted validation and production TypeScript build |
| Jupiter failure/timeout | Pass by controlled error path — no fallback quote exists; UI returns unavailable state |
| Desktop 1280px | Pass — one purchase surface, no horizontal overflow |
| Mobile 390px | Pass — values wrap safely, summary stacks and no horizontal overflow |
| ESLint | Pass |
| Production build | Pass |

Testing did not connect or sign with an owner's real browser wallet. Zero/sufficient-balance button decisions are based on verified balance status and exact raw lamport comparisons; a staging-wallet signing run remains recommended before deployment.

## Remaining risks and limitations

1. Jupiter Metis Swap API v1 is no longer actively maintained and is superseded by Swap V2. Migration should be scheduled as a separate integration change.
2. `onlyDirectRoutes=true` intentionally pins the quote to the public GTREE pool, but Jupiter warns that direct-only routing can produce unfavorable outcomes for illiquid pools.
3. Jupiter currently reports a 100% impact fraction for this route. Website purchasing therefore remains blocked at current liquidity even when the independently derived reference-value loss is smaller for very small inputs.
4. The USD comparison uses Meteora's current pool spot price and SOL/USD field. If either is unavailable, both USD estimates are omitted rather than replaced.
5. The Metis response has no explicit quote-expiration timestamp. The website applies a conservative 15-second freshness window from receipt.
6. Exact network fees are not available until transaction construction and wallet simulation. The UI reserves 0.005 SOL and labels the final fee as wallet-confirmed.
7. Website bonus distribution has no production service or feature flag enabled. The normalized response and UI support a separate server-verified bonus object, but the current value is always `null`.

## Files changed

- `src/features/market/buy-widget.tsx`
- `src/features/market/quote-summary.tsx`
- `src/features/market/quote-details.tsx` (removed)
- `src/features/market/quote-expiration.tsx` (removed)
- `src/features/wallet/wallet-context.tsx`
- `src/features/wallet/wallet-button.tsx`
- `src/lib/market/amounts.ts`
- `src/lib/market/quote-safety.ts`
- `src/lib/market/jupiter.ts`
- `src/lib/providers/market-provider.ts`
- `src/types/market.ts`
- `src/app/api/market/quote/route.ts`
- `src/app/api/market/swap/route.ts`
- `src/features/home/buy-and-chart-section.tsx`
- `src/app/market/page.tsx`
- `docs/buy-gtree-quote-audit.md`
