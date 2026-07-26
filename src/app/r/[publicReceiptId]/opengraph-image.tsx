import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { TokenReceiptService } from "@/lib/admin/token-receipts";
import { isValidReceiptPublicId, shortenMiddle } from "@/lib/admin/token-receipt-shared";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ publicReceiptId: string }>;
}

export default async function Image({ params }: Props) {
  const { publicReceiptId } = await params;
  if (!isValidReceiptPublicId(publicReceiptId)) notFound();
  const receipt = new TokenReceiptService().getPublic(publicReceiptId);
  if (!receipt) notFound();

  return new ImageResponse(
    (
      <div style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        color: "#ecfffb",
        background: "radial-gradient(circle at 18% 20%, rgba(0,229,214,.35), transparent 30%), radial-gradient(circle at 82% 0%, rgba(69,211,153,.22), transparent 28%), #031111",
        fontFamily: "Inter, Arial, sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              border: "2px solid rgba(0,229,214,.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              color: "#00e5d6",
            }}>GT</div>
            <div>
              <div style={{ color: "#00e5d6", fontSize: 18, letterSpacing: 5 }}>GREEN TREE</div>
              <div style={{ fontSize: 38, fontWeight: 700 }}>GTREE Transfer Receipt</div>
            </div>
          </div>
          <div style={{
            border: "1px solid rgba(0,229,214,.45)",
            background: "rgba(0,229,214,.12)",
            color: "#8ffcf2",
            borderRadius: 999,
            padding: "12px 22px",
            fontSize: 24,
            fontWeight: 700,
          }}>{receipt.status === "confirmed" ? "Confirmed" : receipt.status === "failed" ? "Failed" : "Submitted"}</div>
        </div>
        <div style={{
          border: "1px solid rgba(255,255,255,.14)",
          background: "rgba(255,255,255,.07)",
          borderRadius: 36,
          padding: 42,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}>
          <div style={{ color: "#b8d7d2", fontSize: 24 }}>Verified on Solana</div>
          <div style={{ color: "#00e5d6", fontSize: 74, fontWeight: 800, lineHeight: 1 }}>{receipt.amountGtree} GTREE</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 25, color: "#ecfffb" }}>
            <span>Recipient: {shortenMiddle(receipt.recipientWallet, 8, 8)}</span>
            <span>Receipt: {receipt.publicId}</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#9bb8b4", fontSize: 24 }}>
          <span>Issued by Green Tree</span>
          <span>gtree.land</span>
        </div>
      </div>
    ),
    size,
  );
}
