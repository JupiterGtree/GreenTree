import { NextResponse } from "next/server";
import { authorizeNewsWrite } from "@/lib/admin/news-request";
import { NewsService, NewsValidationError, type NewsPostInput } from "@/lib/news/service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = await authorizeNewsWrite(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  try {
    const input = await request.json() as NewsPostInput;
    const post = new NewsService().create(input, authorization.session.user);
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    if (error instanceof NewsValidationError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to create news post." }, { status: 500 });
  }
}
