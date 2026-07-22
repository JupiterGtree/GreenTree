# Green Tree Production Data Audit

Audit date: 2026-07-18  
Scope: complete `src/`, public project documents, environment configuration, route handlers, wallet integration, and production-facing pages.  
Confirmed network: Solana Mainnet  
Confirmed mint: `AYJ2xXLxNrcJfx7ycgZA6FQnpTSoipdRcCvJPLMadpuJ`  
Confirmed Meteora DAMM v2 pool: `4EfPeDK4XEfpBXDsu6NwHTaGqh3CzPPT6jCemU5FeWJE`

## Classification legend

1. Live on-chain data
2. Live market-derived data
3. Official static project information
4. Admin-managed project information
5. Derived/calculated data
6. Demo or simulated data
7. Currently unavailable data

## Findings

| Page | Component | Current value | Current data source | Data classification | Problem | Required production source | Implementation priority | Risk level | Recommended action | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Global | `ENV` / project constants | Mint, network, pool, website, explorer, X, Telegram, email aliases | Environment variables plus `PROJECT` constants | 3. Official static project information | Public and server-only configuration are mixed; RPC URL could later contain a private provider key | Confirmed owner values and server-only environment | P0 | High | Split server-only configuration, validate all Solana addresses, remove demo mode as a production fallback | Phase 1 target |
| Global | README / `.env.example` | Demo mode described as the default and live mode as optional | Stale prototype documentation | 6. Demo or simulated data | Documentation contradicts the current live-only production direction | Current production configuration contract | P0 | Medium | Rewrite environment documentation; never fall back to demo | Phase 1 target |
| Global | `mock-market.ts` | Seeded USD/SOL prices, chart, holders, liquidity, volume, quote and network fee | Deterministic PRNG and fabricated 2026-07-17 anchor | 6. Demo or simulated data | Plausible values can be accidentally reconnected to production UI | None | P0 | Critical | Remove after audit; production failures must be unavailable states | Phase 1 target |
| Global | `seeded-random.ts` | Deterministic pseudo-random generator | Local algorithm | 6. Demo or simulated data | Exists only to support fabricated market data | None | P1 | High | Remove with mock market data | Phase 1 target |
| Global | `mock-transactions.ts` | Eight fabricated transactions, wallets, signatures, amounts and statuses | Local constants based on demo anchor | 6. Demo or simulated data | Explorer links look verifiable but signatures are fabricated | Solana RPC transactions involving confirmed mint/pool/project accounts | P0 | Critical | Remove and replace with neutral normalized verified transactions | Phase 1 target |
| Global | `mock-transparency.ts` | Eleven mixed fake/policy/on-chain/report records | Local constants | 6. Demo or simulated data | Fabricated signatures, dates, amounts and claims are mixed with real policy text | Live Solana facts plus official document registry plus future admin reports | P0 | Critical | Remove demo records; publish only source-backed records | Phase 1 target |
| Global | `mock-missions.ts` | Six fully fabricated mission records | Local constants | 6. Demo or simulated data | Locations, budgets, partners, progress, evidence and signatures are examples, not real operations | Future admin-managed verified mission repository | P1 | High | Keep out of verified production feeds; show honest no-published-missions state | Phase 2 / content owner |
| Header / Footer / Docs | Official links and contact blocks | Correct website, `@GreenTreedHQ`, Telegram and approved mailboxes | `PROJECT` and `OFFICIAL_LINKS.md` | 3. Official static project information | No inconsistency found; `no-reply` must not become a user contact | Owner-confirmed official links | P0 | Low | Retain centralized constants; use `no-reply` only as sender metadata | Verified |
| Hero | Mainnet and shortened mint indicators | Mainnet label and confirmed mint | Official constants | 3. Official static project information | Mainnet health is not represented here; label is identity, not live status | Official configuration; optional RPC health separately | P2 | Low | Retain as identity label, do not call it live health | Audited |
| Home / Token | Technical Token Facts | Network, Classic SPL, decimals 9, 1B fixed, transferability, pricing | `PROJECT` constants | Mixed 3 and 7 | Decimals, current supply, token program and authorities should be checked on-chain; fixed maximum is a policy claim | Solana `getAccountInfo` + `getTokenSupply`, official policy for maximum | P0 | High | Normalize a live `TokenState`; show unavailable rather than static substitute for failed on-chain fields | Phase 1 target |
| Home / Token | Authorities and Control | Only Public market and Unrestricted cards | Static provider objects | 3. Official static project information | Mint and freeze authority states are omitted even though they are material on-chain facts | Parsed Solana mint account | P0 | Critical | Add verified mint/freeze states with source and fetch timestamp | Phase 1 target |
| Token | Allocation | Nine percentages totaling 100% | Whitepaper v2.0.0 / `PROJECT` constants | 3. Official static project information | Allocation labels are policy/accounting categories, not proof of current balances | Official documents; future on-chain category-address mapping | P2 | Medium | Retain as documented allocation and avoid implying current wallet balances | Retain official static |
| Transparency | Treasury control | Squads program, multisig, vault, members, 2-of-2 | Whitepaper / project constants | 3. Official static project information | Addresses are documented but the UI does not verify current Squads state on-chain | Squads program accounts and Solana RPC | P2 | High | Label project-published until on-chain decoder is implemented | Phase 2 |
| Market / Home | GTREE/SOL spot price | Meteora `current_price` | Official Meteora public pool data endpoint | 2. Live market-derived data | Response is cast without schema validation or timeout | Validated Meteora response for confirmed pool | P0 | High | Validate pool/mints/numbers, timeout, short cache, unavailable on failure | Phase 1 target |
| Market / Home | SOL/USD conversion | Meteora `token_y.price` | Official Meteora public pool data endpoint | 2. Live market-derived data | Source is market-derived and schema is not contractually documented | Validated Meteora SOL price or a future dedicated oracle | P0 | Medium | Validate and expose source/freshness; do not substitute zero | Phase 1 target |
| Market / Home | GTREE/USD price | GTREE/SOL multiplied by SOL/USD | Local calculation from Meteora fields | 5. Derived/calculated data | Zero/invalid inputs can silently become a plausible zero price | Validated GTREE/SOL and SOL/USD values | P0 | High | Return unavailable unless both operands are finite and positive | Phase 1 target |
| Market / Home | Implied valuation / FDV | Spot price multiplied by pool-reported supply | Local calculation | 5. Derived/calculated data | Label says implied valuation, but supply source is a floating-point API field | On-chain raw supply plus validated spot price | P1 | Medium | Use on-chain supply or explicitly label maximum-supply valuation | Phase 1 target |
| Market / Home | Liquidity | Meteora TVL, otherwise reserve-derived estimate | Market API plus calculation | 2 / 5 | `tvl: 0` triggers a reserve estimate without disclosing the fallback; reserve decimals/units need validation | Confirmed pool reserves or validated pool TVL | P1 | High | Expose derivation/source; unavailable if reserves cannot be validated | Phase 1 target |
| Market / Home | 24h volume and fees | Meteora `volume[24h]`, `fees[24h]` | Official pool API | 2. Live market-derived data | Current zero may be valid, but missing fields are also coerced to zero | Validated nullable fields | P1 | Medium | Preserve valid zero, represent missing as unavailable | Phase 1 target |
| Market | Holder count | Meteora token metadata holder count | Meteora pool API | 2. Live market-derived data | Not an on-chain index and may be stale/incomplete | Reliable token indexer or enumerated token accounts | P2 | High | Do not present as verified in Phase 1; show unavailable | Phase 1 cleanup |
| Market | Blacklist flag | `is_blacklisted` from Meteora API | Meteora pool API | 2. Live market-derived data | Meaning is undocumented and should not become a project-risk claim | Meteora documentation/owner clarification | P2 | High | Keep out of user-facing claims; retain only diagnostic metadata | Blocked on source semantics |
| Market | Historical candles | Meteora `/ohlcv` points | Official documented Meteora DAMM v2 API | 2. Live market-derived data | The endpoint rejects a true 30-day/4h request for this pool; missing ranges must not become zero or a flat line | Official Meteora OHLCV within its accepted range; another documented source for true 30D | P1 | High | Validate points, expose actual available start and show historical-unavailable state; never synthesize a line | Phase 1 hardened; true 30D remains unavailable |
| Market | Empty chart spot | `spotPrice ?? 0` | Pool response or numeric fallback | 6. Demo or simulated data | A missing price is rendered as real zero | Validated spot or unavailable state | P0 | High | Remove zero fallback from display | Phase 1 target |
| Buy widget | Quote output, minimum received, price impact, route | Jupiter Metis v1 quote | Jupiter official API | 2. Live market-derived data | No timeout; response validation is partial; route is not checked against confirmed pool | Jupiter quote validated against mint, amounts and Meteora pool AMM key | P0 | Critical | Add timeout, full field validation and confirmed-pool route verification | Phase 1 target |
| Buy widget | Reference USD price | Meteora request inside quote normalization | Meteora API | 5. Derived/calculated data | Failed market fetch silently becomes `$0`; independent fetch duplicates snapshot work | Validated nullable conversion result | P0 | High | Return `null`/unavailable, never zero fallback | Phase 1 target |
| Buy widget | Network fee | Hardcoded `0` | Local object | 6. Demo or simulated data | Zero looks like a verified fee estimate | Wallet simulation / prepared transaction response | P0 | High | Display “Shown in wallet” until a verified estimate exists | Phase 1 target |
| Buy widget | Quote expiry | `Date.now() + 15 seconds` | Local refresh policy | 5. Derived/calculated data | Jupiter v1 does not return an expiry; UI may imply provider-guaranteed validity | Explicit local freshness deadline | P1 | Medium | Label as local refresh window and document policy | Phase 1 target |
| Buy widget | Swap transaction | Serialized transaction from Jupiter | Jupiter official API | 2. Live market-derived data | Wallet and mint are validated, but destination pool/route and response timeout are not fully controlled | Validated quote + confirmed pool + wallet confirmation | P0 | Critical | Revalidate route server-side, enforce Mainnet IDs, timeout, never auto-sign | Phase 1 target |
| Wallet | SOL and GTREE balances | Solana RPC | 1. Live on-chain data | Token `uiAmount` is accumulated with floating point; no timeout | Raw lamports and raw SPL amounts using bigint-safe strings | P1 | High | Validate owner/mint and return raw strings plus formatted display | Phase 1 target |
| Home / Market | Latest transactions | Empty array from live provider | No source | 7. Currently unavailable data | Empty array is indistinguishable from verified zero activity; heading promises ecosystem activity | Solana signatures and parsed transactions for pool/mint | P0 | High | Return typed source status and neutral verified interactions | Phase 1 target |
| Home / Market | Transaction filters | Market/liquidity/treasury/mission labels | UI state | 4. Admin-managed project information | On-chain interactions cannot safely be classified into those business categories without decoding rules | Neutral pool/token interaction categories | P1 | Medium | Use Swap/Token transfer/Unknown interaction only when derivable | Phase 1 target |
| Liquidity | Cumulative proceeds | Hardcoded zero | Live provider placeholder | 7. Currently unavailable data | UI text says unavailable but progress rings calculate 0%, conflating unavailable with zero | Admin accounting plus published treasury records | P1 | High | Use nullable value and disable progress calculation when unavailable | Phase 1 cleanup |
| Liquidity | Thresholds 50k/100k/200k and 18/22/32% | Liquidity Policy v2.0.0 | 3. Official static project information | No data correctness issue; they are policy targets, not achieved state | Official project documents | P2 | Low | Retain with project-published label | Retain official static |
| Transparency | Summary counts | Counts derived from demo records; security incidents hardcoded 0 | Demo array | 6. Demo or simulated data | Unsupported counts imply published evidence that does not exist | Calculated real records; security text from admin publication | P0 | Critical | Remove unsupported metrics; distinguish no published report from proof of no incident | Phase 1 target |
| Transparency | Mint, authority and treasury records | Mixed policy statements and fake dates/signatures | Demo array | 6. Demo or simulated data | Real claims are contaminated by fabricated evidence | Live token state and official documents | P0 | Critical | Generate records only from live state and official document metadata | Phase 1 target |
| Transparency | Policy records | Token, liquidity and reporting descriptions | Official markdown, copied into demo array | 3. Official static project information | Duplicated text and fabricated timestamps | Official document registry | P1 | Medium | Source from document metadata; mark project-published | Phase 1 target |
| Transparency | Security record | “No security incidents reported” with demo timestamp | Demo array | 6. Demo or simulated data | Absence of a demo record is not evidence of no incident | Admin-published incident register | P0 | Critical | Show “No security incidents have been published” without implying impossibility | Phase 1 target |
| Missions / Home | Mission cards and detail routes | Six example missions with invented operational data | Demo array | 6. Demo or simulated data | Explicitly labelled examples but still occupy production-facing discovery and static routes | Admin-managed mission repository | P1 | High | Replace production feed with honest empty state; retain examples only in a non-production showcase if owner requests | Phase 2 / owner confirmation |
| Missions | Annual “more than ten” commitment | Whitepaper / mission policy | 3. Official static project information | It is an intention subject to feasibility, not a current achievement | Official v2.0.0 documents | P2 | Medium | Keep qualifying language; never derive mission count from it | Retain official static |
| Roadmap | Five phases and statuses | `roadmap.ts` | 4. Admin-managed project information | Statuses can silently become stale; no publication workflow or updated timestamp | Owner-maintained release/status source | P2 | Medium | Add admin source and last-reviewed metadata in Phase 2 | Phase 2 |
| Ecosystem | Product module descriptions/statuses | `ecosystem.ts` and whitepaper future-products section | 3 / 4 | Future concepts may be mistaken for active products | Official roadmap/product publication | P2 | Medium | Preserve wording that distinguishes active, planned and research concepts | Audited |
| Docs | Document titles, versions, dates and download paths | `documents.ts` plus public files | 3. Official static project information | Metadata is duplicated but matches v2.0.0 files; checksum verification is not surfaced | Bundled official docs and `SHA256SUMS.txt` | P2 | Low | Retain; optionally automate checksum validation in Phase 2 | Audited |
| Design system | Demo badge and placeholder input | Internal `/design-system` route | 6. Demo or simulated data | Not a production content source, but route is publicly accessible | None | P3 | Low | Exclude or protect internal route before launch | Phase 2 |

## Confirmed live observations during audit

The following observations were read directly from Solana Mainnet and the confirmed pool on 2026-07-18. They are observations, not committed fallback constants:

- Mint account owner: Classic SPL Token Program `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`.
- Decimals: `9`.
- Raw supply: `1000000000000000000` atomic units (`1,000,000,000` GTREE).
- Mint authority: `null` (revoked).
- Freeze authority: `null` (not retained).
- Pool response address and token mints match the confirmed GTREE/SOL pool.
- Jupiter returned a direct Meteora DAMM v2 route for a test quote; this must still be revalidated for every production quote.
- The pool and mint addresses returned recent finalized Solana signatures; business labels such as Buy/Sell cannot be inferred safely from signatures alone.

## Search and repository audit notes

- No active `Math.random()` call exists; deterministic random generation exists only in the demo market module.
- No fake `setInterval` market updater exists. The only interval is the quote countdown UI; it tracks a local freshness deadline.
- No application `localStorage` or `sessionStorage` data cache was found.
- Client debounce `setTimeout` calls are interaction controls, not data generators.
- The original live provider returned an indistinguishable empty transaction array. Phase 1 replaced it with a source-status-aware Solana RPC implementation and removed the mock transaction file.
- Correct X, Telegram and email values are centralized in `PROJECT` and match `public/docs/OFFICIAL_LINKS.md`.

## Phase 1 boundary

Phase 1 will implement verified token state, validated market quote/conversions, confirmed pool identity, recent neutral Solana interactions, official links, honest unavailable states, and removal of production-risk mock market/transaction/transparency data. Mission administration, Squads account decoding, roadmap administration, holder indexing and a documented long-range OHLCV provider remain outside Phase 1.

## Phase 1 disposition

Phase 1 is complete. The market, transaction and transparency mock modules and their seeded-random dependency were removed. Token identity/authorities now come from validated Solana Mainnet RPC; market and quote data are validated against the confirmed Meteora pool and GTREE mint; recent interactions have a neutral typed RPC implementation; and failures render unavailable states. The detailed implementation, environment, cache, verification, limitation, blocker and Phase 2 report is in `docs/production-data-phase-1.md`.

The explicitly labelled example mission dataset, static roadmap administration, Squads decoding, holder indexing, durable stale-data storage and a genuine 30-day historical source remain open and were not disguised as Phase 1 completion.
