import { callLlm, type LlmMessage, type LlmApiKeys } from "@/lib/providers/llm";
import { TOOLS, buildToolSchema, type AgentTraceStep, type ToolContext } from "./tools";

const MAX_ITERATIONS = 4;

function buildSystemPrompt(): string {
  return `You are a Vietnam stock analyst agent with access to live market data tools.

Use ReAct format — respond with exactly ONE block per turn:

THOUGHT: <your reasoning about what information you need>
ACTION: <tool_name>({"key": "value"})

Once you have enough data, respond with:

THOUGHT: <final reasoning>
FINAL ANSWER:
<your complete markdown-formatted answer>

Available tools:
${buildToolSchema()}

Hard rules:
- Call ONE tool per response — never invent data.
- Never fabricate prices, PE ratios, RSI values, or news headlines.
- Only write FINAL ANSWER when tool observations support your response.
- If a tool returns no data, try a different tool or acknowledge the limitation honestly.
- Format the FINAL ANSWER in clear markdown with bold headers and bullet points.`;
}

export type AgentRunResult = {
  answer: string;
  trace: AgentTraceStep[];
  provider: string;
  model: string;
  iterations: number;
};

export async function runAgent(
  userQuestion: string,
  history: LlmMessage[],
  opts?: { apiKeys?: LlmApiKeys; toolCtx?: ToolContext },
): Promise<AgentRunResult> {
  const trace: AgentTraceStep[] = [];
  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    ...history.slice(-6),
    { role: "user", content: userQuestion },
  ];

  let lastProvider = "fallback";
  let lastModel = "rule-based";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await callLlm(messages, "", {
      maxTokens: 800,
      skipDefaultSystem: true,
      apiKeys: opts?.apiKeys,
    });

    if (!result.content) break;

    lastProvider = result.provider;
    lastModel = result.model;

    const text = result.content.trim();

    const thoughtMatch = text.match(/THOUGHT:\s*([\s\S]*?)(?=ACTION:|FINAL ANSWER:|$)/);
    const actionMatch  = text.match(/ACTION:\s*(\w+)\s*\(\s*(\{[^]*?\})\s*\)/);
    const finalMatch   = text.match(/FINAL ANSWER:\s*([\s\S]+)/);

    const thought = thoughtMatch?.[1]?.trim() ?? "";

    if (finalMatch) {
      trace.push({ thought });
      return {
        answer: finalMatch[1].trim(),
        trace,
        provider: lastProvider,
        model: lastModel,
        iterations: i + 1,
      };
    }

    if (actionMatch) {
      const toolName = actionMatch[1];
      let toolArgs: Record<string, string> = {};
      try {
        toolArgs = JSON.parse(actionMatch[2]) as Record<string, string>;
      } catch {
        toolArgs = {};
      }

      let observation = `Unknown tool: ${toolName}`;
      if (toolName in TOOLS) {
        try {
          const r = await TOOLS[toolName].run(toolArgs, opts?.toolCtx ?? {});
          observation = r.ok ? r.data : `Tool returned no useful data: ${r.data}`;
        } catch (e) {
          observation = `Tool error: ${String(e).slice(0, 200)}`;
        }
      }

      trace.push({
        thought,
        action: `${toolName}(${actionMatch[2]})`,
        observation,
      });

      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: `OBSERVATION:\n${observation}` });
    } else {
      // LLM didn't follow ReAct format — treat the whole response as a direct answer
      trace.push({ thought: text });
      return {
        answer: text,
        trace,
        provider: lastProvider,
        model: lastModel,
        iterations: i + 1,
      };
    }
  }

  // Exhausted iterations — synthesise from what was gathered
  const synthResult = await callLlm(
    [
      ...messages,
      {
        role: "user",
        content:
          "Based on all the data retrieved so far, provide your FINAL ANSWER now in markdown format.",
      },
    ],
    "",
    { maxTokens: 1200, skipDefaultSystem: true, apiKeys: opts?.apiKeys },
  );

  const synthText = synthResult.content?.trim() ?? "";
  const finalInSynth = synthText.match(/FINAL ANSWER:\s*([\s\S]+)/);

  return {
    answer:
      finalInSynth?.[1]?.trim() ??
      (synthText || "I reached my retrieval limit without enough data. Please try rephrasing your question."),
    trace,
    provider: synthResult.provider ?? lastProvider,
    model: synthResult.model ?? lastModel,
    iterations: MAX_ITERATIONS,
  };
}
