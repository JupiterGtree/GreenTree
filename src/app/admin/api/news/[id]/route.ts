import { NextResponse } from "next/server";
import { authorizeNewsWrite } from "@/lib/admin/news-request";
import { NewsService, NewsValidationError, type NewsPostInput } from "@/lib/news/service";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorization = await authorizeNewsWrite(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  try {
    const { id } = await params;
    const payload = await request.json() as {
      action?: "edit" | "publish" | "unpublish" | "schedule" | "archive" | "duplicate";
      post?: NewsPostInput;
      scheduledAt?: number;
    };
    const service = new NewsService();
    const actor = authorization.session.user;
    let post;
    switch (payload.action) {
      case "edit":
        if (!payload.post) throw new NewsValidationError(["Post content is required."]);
        post = service.edit(id, payload.post, actor);
        break;
      case "publish":
        post = service.publish(id, actor);
        break;
      case "unpublish":
        post = service.unpublish(id, actor);
        break;
      case "schedule":
        post = service.schedule(id, Number(payload.scheduledAt), actor);
        break;
      case "archive":
        post = service.archive(id, actor);
        break;
      case "duplicate":
        post = service.duplicateAsDraft(id, actor);
        break;
      default:
        throw new NewsValidationError(["A valid news action is required."]);
    }
    return NextResponse.json({ post });
  } catch (error) {
    if (error instanceof NewsValidationError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update news post." }, { status: 500 });
  }
}
