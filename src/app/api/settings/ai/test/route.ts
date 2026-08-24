import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { LLM_PROVIDERS, testProvider } from "@/lib/providers/llm";
import { testProviderRequestSchema } from "@/lib/validation/schemas";
import { parseJsonBody } from "@/lib/validation/validate";

export type TestProviderRequest = {
  id: string;
  model: string;
  apiKey?: string;
};

export type TestProviderResponse = {
  ok: boolean;
  message: string;
  latencyMs: number;
};

// Runs a real, tiny chat completion against one provider/model so the settings
// page can confirm the currently configured model actually responds.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody(request, testProviderRequestSchema);
  if (parsed.response) return parsed.response;
  const body = parsed.data;
  const id = body.id;

  if (!LLM_PROVIDERS.some((p) => p.id === id)) {
    return NextResponse.json({ ok: false, message: "Unknown provider", latencyMs: 0 }, { status: 400 });
  }

  const result = await testProvider(
    id as (typeof LLM_PROVIDERS)[number]["id"],
    body.model ?? "",
    body.apiKey,
  );

  return NextResponse.json(result satisfies TestProviderResponse);
}
