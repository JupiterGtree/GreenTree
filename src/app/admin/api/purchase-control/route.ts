import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { AdminPermissionError } from "@/lib/admin/permissions";
import { RuntimeSettingError, RuntimeSettingsService } from "@/lib/admin/runtime-settings";
import { PROJECT } from "@/lib/constants/project";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "operations.read", false);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  return NextResponse.json({
    settings: new RuntimeSettingsService().list(),
    criticalAddresses: [
      { key: "gtreeMint", label: "GTREE mint", value: process.env.FOUNDATION_DIRECT_GTREE_MINT?.trim() || PROJECT.mint },
      { key: "treasuryRecipient", label: "Treasury recipient", value: publicAddress("FOUNDATION_DIRECT_TREASURY_RECIPIENT") },
      { key: "saleTokenAccount", label: "Sale token account", value: publicAddress("FOUNDATION_DIRECT_SALE_TOKEN_ACCOUNT") },
      { key: "saleSignerPublicKey", label: "Sale signer public key", value: publicAddress("FOUNDATION_DIRECT_SALE_SIGNER_PUBLIC_KEY") },
    ],
    canChangeNonSensitive: authorization.session.user.role === "OWNER" || authorization.session.user.role === "ADMIN",
    canChangeSensitive: authorization.session.user.role === "OWNER",
  }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "admin.settings.manage", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const body = await boundedJson(request);
    if (typeof body.key !== "string" || typeof body.reason !== "string") {
      throw new RuntimeSettingError("Setting key and reason are required.", "INVALID");
    }
    const setting = new RuntimeSettingsService().update(
      body.key,
      body.value,
      body.reason,
      typeof body.confirmation === "string" ? body.confirmation : undefined,
      authorization.session.user,
    );
    return NextResponse.json({ setting });
  } catch (error) {
    if (error instanceof AdminPermissionError) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    if (error instanceof RuntimeSettingError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: "Unable to update runtime setting." }, { status: 500 });
  }
}

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > 8_192) {
    throw new RuntimeSettingError("Request body is too large.", "INVALID");
  }
  const text = await request.text();
  if (text.length > 8_192) throw new RuntimeSettingError("Request body is too large.", "INVALID");
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new RuntimeSettingError("Invalid JSON body.", "INVALID"); }
}

function publicAddress(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}
