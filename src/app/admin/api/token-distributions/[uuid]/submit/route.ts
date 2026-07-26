import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { TokenDistributionError, TokenDistributionService } from "@/lib/admin/token-distributions";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ uuid: string }> }): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "token-distributions.confirm", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const { uuid } = await params;
    const body = await request.json() as {
      phrase?: string;
      mode?: "SERVER" | "CONNECTED_ADMIN";
      signedTransactionBase64?: string;
    };
    const service = new TokenDistributionService();
    const record = body.mode === "CONNECTED_ADMIN"
      ? await service.submitConnectedWallet(uuid, body.phrase ?? "", body.signedTransactionBase64 ?? "", authorization.session.user)
      : await service.submitServerFeePayer(uuid, body.phrase ?? "", authorization.session.user);
    const submission = record as typeof record & {
      submissionReceipt?: { publicId: string };
      receiptError?: { code: string; message: string } | null;
    };
    const receipt = record.receipt ?? (submission.submissionReceipt ? {
      publicId: submission.submissionReceipt.publicId,
      publicUrl: `https://gtree.land/r/${submission.submissionReceipt.publicId}`,
      status: "submitted" as const,
      createdAt: Date.now(),
      blockchainVerifiedAt: null,
      revokedAt: null,
    } : null);
    return NextResponse.json({
      success: true,
      distributionId: record.uuid,
      status: record.status,
      transactionSignature: record.transactionSignature,
      receipt: receipt ? { publicId: receipt.publicId, url: receipt.publicUrl } : null,
      receiptError: submission.receiptError ?? null,
      record: { ...record, receipt },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof TokenDistributionError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  return NextResponse.json({ error: "Unable to submit token distribution." }, { status: 500 });
}
