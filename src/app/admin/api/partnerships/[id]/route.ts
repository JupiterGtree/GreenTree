import { NextResponse } from "next/server";
import { authorizePartnershipRequest } from "@/lib/admin/partnership-request";
import {
  PARTNERSHIP_STATUSES, getPartnershipRepository, type PartnershipStatus,
} from "@/lib/partnerships/repository";
import {
  PartnershipService, PartnershipValidationError,
} from "@/lib/partnerships/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorization = await authorizePartnershipRequest(request);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const { id } = await params;
  const repository = getPartnershipRepository();
  const item = repository.findById(id);
  if (!item) return NextResponse.json({ error: "Partnership request was not found." }, { status: 404 });
  return NextResponse.json({
    request: item,
    timeline: repository.timeline(id),
    notes: repository.notes(id),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorization = await authorizePartnershipRequest(request, true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const raw = await request.text();
    if (raw.length > 8_192) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    const payload = JSON.parse(raw) as {
      action?: "status" | "note" | "assign" | "archive" | "resubmission" | "read";
      status?: string;
      note?: string;
      assignedUserId?: string | null;
      allow?: boolean;
    };
    const { id } = await params;
    const service = new PartnershipService();
    const actor = authorization.session.user;
    switch (payload.action) {
      case "status":
        if (!PARTNERSHIP_STATUSES.includes(payload.status as PartnershipStatus)) {
          throw new PartnershipValidationError(["Invalid status."]);
        }
        return NextResponse.json({ request: service.updateStatus(id, payload.status as PartnershipStatus, actor) });
      case "archive":
        return NextResponse.json({ request: service.updateStatus(id, "ARCHIVED", actor) });
      case "note":
        service.addNote(id, payload.note ?? "", actor);
        return NextResponse.json({ success: true });
      case "assign":
        return NextResponse.json({ request: service.assign(id, payload.assignedUserId ?? null, actor) });
      case "resubmission":
        return NextResponse.json({ request: service.setResubmission(id, Boolean(payload.allow), actor) });
      case "read":
        return NextResponse.json({ request: service.markRead(id, actor) });
      default:
        throw new PartnershipValidationError(["A valid action is required."]);
    }
  } catch (error) {
    if (error instanceof PartnershipValidationError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Unable to update partnership request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update partnership request." }, { status: 500 });
  }
}
