import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { PROJECT } from "@/lib/constants/project";
import { solanaRpc } from "@/services/solana/rpc";
import { getTokenState } from "@/data/token/get-token-state";

interface BalanceResponse { value: number }
interface TokenAccountResponse {
  value: Array<{
    account: {
      data: { parsed: { info: { tokenAmount: { amount: string; decimals: number } } } };
    };
  }>;
}

function rawToNumber(raw: bigint, decimals: number): number {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  return Number(whole) + Number(fraction) / Number(base);
}

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address");
    if (!address) throw new Error("Wallet address is required.");
    const owner = new PublicKey(address).toBase58();
    const tokenState = await getTokenState();
    if (!tokenState.data || tokenState.data.mint !== PROJECT.mint || tokenState.data.network !== "solana-mainnet") {
      throw new Error("The GTREE mint could not be verified on Solana Mainnet.");
    }

    const [balance, tokenAccounts] = await Promise.all([
      solanaRpc<BalanceResponse>("getBalance", [owner, { commitment: "confirmed" }]),
      solanaRpc<TokenAccountResponse>("getTokenAccountsByOwner", [
        owner,
        { mint: PROJECT.mint },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]),
    ]);
    const rawGtree = tokenAccounts.value.reduce((total, account) => {
      const amount = account.account.data.parsed.info.tokenAmount.amount;
      return /^\d+$/.test(amount) ? total + BigInt(amount) : total;
    }, BigInt(0));
    return NextResponse.json(
      {
        solBalance: balance.value / 1_000_000_000,
        solBalanceLamports: balance.value.toString(),
        gtreeBalance: rawToNumber(rawGtree, tokenState.data.decimals),
        gtreeBalanceRaw: rawGtree.toString(),
        decimals: tokenState.data.decimals,
        mint: tokenState.data.mint,
        network: tokenState.data.network,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Wallet balances unavailable." },
      { status: 422 },
    );
  }
}
