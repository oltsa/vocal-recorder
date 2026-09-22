import type { AnalysisReport } from "@/features/recorder/lib/analysis";
import {
  isVocalChainToolKey,
  type VocalChainPatch,
  type VocalChainSettings,
  type VocalChainToolKey,
} from "@/features/recorder/lib/audio-chain";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type OllamaChainResponse = {
  assistantMessage: string;
  toolsUsed: VocalChainToolKey[];
  chainPatch: VocalChainPatch;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

const OLLAMA_BASE_URL = "http://127.0.0.1:11434";

const SYSTEM_PROMPT = `You control a browser webcam recorder vocal chain.
The user describes the sound they want in natural language.

Available tools in chain order:
1. noiseGate: use for room noise, headphone bleed, idle hiss between phrases. Settings: enabled, thresholdDb (-70 to -10), floorDb (-80 to 0), attackMs (1-80), releaseMs (20-500), holdMs (0-400).
2. highPassFilter: use for rumble, boom, plosives. Settings: enabled, frequencyHz (20-220).
3. bodyEq: use for warmth, mud, boxiness, body. Settings: enabled, frequencyHz (120-600), gainDb (-12 to 12), q (0.3 to 4).
4. deEsser: use for harsh s, t, and brightness control. Settings: enabled, frequencyHz (3500-10000), thresholdDb (-45 to -10), amountPercent (0-100).
5. compressor: use for main control, steadiness, intimacy, forwardness. Settings: enabled, thresholdDb (-40 to -5), ratio (1 to 8), attackMs (1 to 60), releaseMs (20 to 400), mixPercent (0-100).
6. parallelCompressor: use for a second crushed blend to thicken the vocal under the main compressor. Settings: enabled, thresholdDb (-40 to -5), ratio (1 to 12), attackMs (1 to 60), releaseMs (20 to 400), mixPercent (0-100).
7. saturation: use for density, edge, modern vocal weight, controlled grit. Settings: enabled, drivePercent (0-100), tonePercent (0-100), mixPercent (0-100).
8. airEq: use for brightness, sheen, openness, harshness control. Settings: enabled, frequencyHz (3500-14000), gainDb (-12 to 12).
9. shortReverb: use for short early-space reverb, closeness, polish, subtle room bloom. Settings: enabled, delayMs (10-120), feedbackPercent (0-70), mixPercent (0-50), highCutHz (1500-12000), lowCutHz (80-1200).
10. longReverb: use for longer reverb tail, emotional bloom, layered reverb, ducked tail after phrases. Settings: enabled, delayMs (40-240), feedbackPercent (0-85), mixPercent (0-60), duckingPercent (0-100), highCutHz (1500-12000), lowCutHz (80-1200).

Global chain settings:
- enabled: boolean
- inputGain: 0.25 to 2
- outputGain: -12 to 12
- toolOrder: ordered array of tool names when you want to reorder the chain

Return only valid JSON with this exact shape:
{
  "assistantMessage": "short human explanation",
  "toolsUsed": ["compressor", "airEq"],
  "chainPatch": {
    "enabled": true,
    "inputGain": 1,
    "outputGain": 0,
    "toolOrder": ["noiseGate", "highPassFilter", "bodyEq", "compressor", "parallelCompressor", "airEq", "shortReverb", "longReverb"],
    "tools": {
      "noiseGate": {
        "enabled": true,
        "thresholdDb": -48,
        "floorDb": -18,
        "attackMs": 12,
        "releaseMs": 160,
        "holdMs": 90
      },
      "highPassFilter": {
        "enabled": true,
        "frequencyHz": 90
      },
      "bodyEq": {
        "enabled": true,
        "frequencyHz": 280,
        "gainDb": -2,
        "q": 1.1
      },
      "deEsser": {
        "enabled": true,
        "frequencyHz": 6500,
        "thresholdDb": -30,
        "amountPercent": 45
      },
      "compressor": {
        "enabled": true,
        "thresholdDb": -20,
        "ratio": 2.4,
        "attackMs": 10,
        "releaseMs": 130,
        "mixPercent": 82
      },
      "parallelCompressor": {
        "enabled": true,
        "thresholdDb": -31,
        "ratio": 7,
        "attackMs": 2,
        "releaseMs": 120,
        "mixPercent": 28
      },
      "saturation": {
        "enabled": true,
        "drivePercent": 22,
        "tonePercent": 58,
        "mixPercent": 26
      },
      "airEq": {
        "enabled": true,
        "frequencyHz": 9000,
        "gainDb": 2.5
      },
      "shortReverb": {
        "enabled": true,
        "delayMs": 38,
        "feedbackPercent": 22,
        "mixPercent": 10,
        "highCutHz": 6200,
        "lowCutHz": 260
      },
      "longReverb": {
        "enabled": true,
        "delayMs": 95,
        "feedbackPercent": 20,
        "mixPercent": 15,
        "duckingPercent": 58,
        "highCutHz": 5000,
        "lowCutHz": 260
      }
    }
  }
}

Rules:
- Only include keys that should change.
- toolsUsed must list the tools you intentionally used or adjusted in this response.
- Include toolOrder only when order should change.
- If a tool should be bypassed, include that tool with enabled set to false.
- Default to corrective tools first when the analyzer suggests room or source issues.
- You may use both compressor and parallelCompressor together when a layered vocal compression approach helps.
- Use shortReverb and longReverb as separate layered sends when that supports the user's requested vocal style.
- Remove or bypass older tools if they are hurting the current goal.
- Do not depend on canned prompt hints from the UI; infer the right tools from the user request and analyzer report.
- Do not include markdown, code fences, or extra commentary.
- Favor small, musical changes unless the user clearly asks for something extreme.`;

function extractJsonObject(rawContent: string) {
  const trimmed = rawContent.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Ollama response did not contain JSON.");
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function normalizeToolsUsed(value: unknown): VocalChainToolKey[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (toolName): toolName is VocalChainToolKey =>
      typeof toolName === "string" && isVocalChainToolKey(toolName),
  );
}

export async function fetchOllamaModels() {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);

  if (!response.ok) {
    throw new Error(`Ollama model lookup failed with ${response.status}.`);
  }

  const data = (await response.json()) as OllamaTagsResponse;
  return (data.models ?? [])
    .map((model) => model.name?.trim())
    .filter((name): name is string => Boolean(name));
}

export async function requestChainUpdate(params: {
  model: string;
  currentSettings: VocalChainSettings;
  analysisReport?: AnalysisReport | null;
  conversation: ChatMessage[];
  userPrompt: string;
}) {
  const { model, currentSettings, analysisReport, conversation, userPrompt } = params;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "system",
          content: `Current vocal chain settings: ${JSON.stringify(currentSettings, null, 2)}`,
        },
        ...(analysisReport
          ? [
              {
                role: "system" as const,
                content: `Latest input analyzer report: ${JSON.stringify(analysisReport, null, 2)}`,
              },
            ]
          : []),
        ...conversation.slice(-6).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama chat failed with ${response.status}.`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = data.message?.content;

  if (!content) {
    throw new Error("Ollama returned an empty message.");
  }

  const parsed = JSON.parse(extractJsonObject(content)) as Partial<OllamaChainResponse>;

  if (!parsed.assistantMessage || typeof parsed.assistantMessage !== "string") {
    throw new Error("Ollama response is missing assistantMessage.");
  }

  return {
    assistantMessage: parsed.assistantMessage,
    toolsUsed: normalizeToolsUsed(parsed.toolsUsed),
    chainPatch: parsed.chainPatch ?? {},
  } satisfies OllamaChainResponse;
}
