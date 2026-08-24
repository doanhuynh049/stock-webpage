import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/**
 * Parse + validate a JSON request body against a zod schema.
 * Returns either `{ data }` on success or `{ response }` — a ready-to-return
 * 400 NextResponse — on invalid JSON or a failed schema check.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T; response?: undefined } | { data?: undefined; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return {
      response: NextResponse.json(
        { error: "Invalid request body", issues },
        { status: 400 },
      ),
    };
  }

  return { data: result.data };
}
