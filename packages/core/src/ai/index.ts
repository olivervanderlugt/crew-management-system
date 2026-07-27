// ─── AIService interface ──────────────────────────────────────
// Provider-agnostic. Swap implementations without changing callers.
// Feature is DISABLED when AI_API_KEY env var is not set — zero cost.

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  systemPrompt?: string;
  maxTokens?: number;
}

export interface AICompletionResponse {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIService {
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
  isAvailable(): boolean;
}

// ─── Anthropic implementation ─────────────────────────────────
// Configured via AI_API_KEY env var.
// Model is configurable — do not hardcode a specific model version.

export interface AnthropicAIServiceConfig {
  apiKey: string;
  model?: string; // defaults to claude-sonnet-4-6 or latest available
  baseUrl?: string;
}

export class AnthropicAIService implements AIService {
  private config: AnthropicAIServiceConfig;

  constructor(config: AnthropicAIServiceConfig) {
    this.config = config;
  }

  isAvailable(): boolean {
    return Boolean(this.config.apiKey);
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error("AI service is not configured (AI_API_KEY missing)");
    }

    const model = this.config.model ?? "claude-sonnet-4-6";
    const url =
      this.config.baseUrl ?? "https://api.anthropic.com/v1/messages";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 1024,
        system: request.systemPrompt,
        messages: request.messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} — ${err}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const content = data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    return {
      content,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    };
  }
}

// ─── Stub implementation (no key) ────────────────────────────
export class NoopAIService implements AIService {
  isAvailable(): boolean {
    return false;
  }

  async complete(_request: AICompletionRequest): Promise<AICompletionResponse> {
    return {
      content:
        "AI is niet geconfigureerd. Voeg AI_API_KEY toe aan .env.local om deze functie te activeren.",
    };
  }
}

// ─── Factory ─────────────────────────────────────────────────
export function createAIService(apiKey?: string): AIService {
  if (!apiKey) return new NoopAIService();
  return new AnthropicAIService({ apiKey });
}

// ─── Example feature: natural-language crew search ────────────
export async function naturalLanguageCrewSearch(
  service: AIService,
  query: string,
  context: {
    totalCrew: number;
    skills: string[];
    cities: string[];
  }
): Promise<string> {
  if (!service.isAvailable()) {
    return ""; // caller should check isAvailable() before calling
  }

  const systemPrompt = `Je bent een assistent in een planningssysteem voor crew op events en festivals.
Je helpt beheerders crew te vinden op basis van een zoekopdracht in natuurlijke taal.
Geef een beknopte uitleg van de zoekresultaten en suggereer filters.
Beschikbare skills: ${context.skills.join(", ")}.
Steden: ${context.cities.join(", ")}.
Totaal actief: ${context.totalCrew} crewleden.`;

  const response = await service.complete({
    systemPrompt,
    messages: [{ role: "user", content: query }],
    maxTokens: 512,
  });

  return response.content;
}
