import { describe, expect, it, vi } from "vitest";

import {
  fallbackDigestBrief,
  generateDigestBriefWithNvidia,
  digestBriefWithNvidia,
  parseArticlePreviewJson,
  parseDigestBriefJson,
  validateDigestBriefQuality,
} from "./ai-summary";
import { fallbackDigestBriefFromNews, isDigestBriefSchemaError } from "./digest-brief";

describe("fallbackDigestBrief", () => {
  it("keeps the top five digest articles available when AI is unavailable", () => {
    const brief = fallbackDigestBrief(
      Array.from({ length: 6 }, (_, index) => ({
        category: index < 3 ? "geopolitics" : "business",
        importanceScore: 90 - index,
        publishedAt: null,
        source: `Source ${index + 1}`,
        sourceCount: 1,
        summary: `Summary ${index + 1}`,
        title: `Article ${index + 1}`,
        whyInteresting: null,
      })),
    );

    expect(brief.highlights).toEqual([
      { articleIndex: 0, whatHappened: "Summary 1", whyItMatters: "Ważny sygnał ze źródła Source 1." },
      { articleIndex: 1, whatHappened: "Summary 2", whyItMatters: "Ważny sygnał ze źródła Source 2." },
      { articleIndex: 2, whatHappened: "Summary 3", whyItMatters: "Ważny sygnał ze źródła Source 3." },
      { articleIndex: 3, whatHappened: "Summary 4", whyItMatters: "Ważny sygnał ze źródła Source 4." },
      { articleIndex: 4, whatHappened: "Summary 5", whyItMatters: "Ważny sygnał ze źródła Source 5." },
    ]);
    expect(brief.sections).toHaveLength(2);
    expect(brief.readingTimeMinutes).toBe(1);
  });
});

describe("parseDigestBriefJson", () => {
  it("accepts a complete briefing wrapped in a markdown JSON fence", () => {
    const brief = parseDigestBriefJson(
      `\`\`\`json
      {
        "summary": "Najważniejsze procesy są ze sobą powiązane.",
        "highlights": [{"articleIndex": 0, "whatHappened": "Państwa uzgodniły zmianę.", "whyItMatters": "Wpływa na handel."}],
        "sections": [{"category": "geopolitics", "title": "Nowy układ", "paragraphs": [{"text": "Rozmowy zmieniły układ negocjacji.", "articleIndexes": [0, 1, 1, 9]}]}],
        "watchlist": [{"signal": "Kolejna decyzja", "why": "Pokaże kierunek zmian.", "articleIndexes": [1]}],
        "coverageNote": "Materiały nie pokazują reakcji drugiej strony.",
        "readingTimeMinutes": 4
      }
      \`\`\``,
      2,
    );

    expect(brief).toEqual({
      coverageNote: "Materiały nie pokazują reakcji drugiej strony.",
      highlights: [
        {
          articleIndex: 0,
          whatHappened: "Państwa uzgodniły zmianę.",
          whyItMatters: "Wpływa na handel.",
        },
      ],
      readingTimeMinutes: 1,
      sections: [
        {
          category: "geopolitics",
          paragraphs: [{ articleIndexes: [0, 1], text: "Rozmowy zmieniły układ negocjacji." }],
          title: "Nowy układ",
        },
      ],
      summary: "Najważniejsze procesy są ze sobą powiązane.",
      summaryArticleIndexes: [0],
      watchlist: [
        {
          articleIndexes: [1],
          signal: "Kolejna decyzja",
          why: "Pokaże kierunek zmian.",
        },
      ],
    });
  });

  it("rejects a briefing without thematic synthesis", () => {
    expect(
      parseDigestBriefJson(
        JSON.stringify({
          coverageNote: "Brak danych.",
          highlights: [{ articleIndex: 0, whatHappened: "Fakt", whyItMatters: "Znaczenie" }],
          readingTimeMinutes: 2,
          sections: [],
          summary: "Podsumowanie",
          watchlist: [],
        }),
        1,
      ),
    ).toBeNull();
  });

  it("keeps legacy situation sections readable as one sourced paragraph", () => {
    expect(
      parseDigestBriefJson(
        JSON.stringify({
          coverageNote: "Brak danych o reakcji rynku.",
          highlights: [{ articleIndex: 0, whatHappened: "Fakt", whyItMatters: "Znaczenie" }],
          sections: [{
            articleIndexes: [0, 0, 4],
            category: "business",
            situation: "Starszy zapis sekcji pozostaje czytelny.",
            title: "Gospodarka",
          }],
          summary: "Lead starego formatu.",
          watchlist: [],
        }),
        1,
      ),
    ).toMatchObject({
      sections: [{
        paragraphs: [{ articleIndexes: [0], text: "Starszy zapis sekcji pozostaje czytelny." }],
      }],
    });
  });
});

describe("parseArticlePreviewJson", () => {
  it("accepts a preview wrapped in a markdown JSON fence", () => {
    expect(
      parseArticlePreviewJson(`
        \`\`\`json
        {"whatHappened":"Firma wydała nowy model.","whyItMatters":"Zwiększa konkurencję.","clickIf":"Jeśli śledzisz rynek AI.","practicalBucket":"product_trend","topics":["AI"],"entities":["Example"]}
        \`\`\`
      `),
    ).toEqual({
      clickIf: "Jeśli śledzisz rynek AI.",
      entities: ["Example"],
      practicalBucket: "product_trend",
      topics: ["AI"],
      whatHappened: "Firma wydała nowy model.",
      whyItMatters: "Zwiększa konkurencję.",
    });
  });
});

describe("isDigestBriefSchemaError", () => {
  it("allows older deployments to render before the digest summary migration is applied", () => {
    expect(isDigestBriefSchemaError({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isDigestBriefSchemaError({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(isDigestBriefSchemaError({ code: "42501", message: "permission denied" })).toBe(false);
  });
});

describe("fallbackDigestBriefFromNews", () => {
  it("renders a digest brief from the newest published news when the summary table is unavailable", () => {
    const brief = fallbackDigestBriefFromNews([
      {
        category: "business",
        digestDate: "2026-07-09",
        id: "older",
        preview: null,
        source: "Older source",
        summary: "Older summary",
        title: "Older article",
        whyInteresting: null,
      },
      {
        category: "geopolitics",
        digestDate: "2026-07-10",
        id: "newest",
        preview: { whyItMatters: "This is the key development." },
        source: "Newest source",
        sourceUrl: "https://example.com/newest",
        summary: "Newest summary",
        title: "Newest article",
        whyInteresting: null,
      },
    ]);

    expect(brief).toEqual({
      coverageNote: "Widok awaryjny bez syntezy AI — pełny kontekst znajduje się w materiałach źródłowych.",
      digestDate: "2026-07-10",
      highlights: [
        {
          newsItemId: "newest",
          source: "Newest source",
          sourceUrl: "https://example.com/newest",
          supportsSummary: true,
          title: "Newest article",
          whatHappened: "Newest summary",
          whyItMatters: "This is the key development.",
        },
      ],
      readingTimeMinutes: 1,
        sections: [
          {
            category: "geopolitics",
            paragraphs: [{
              references: [{ newsItemId: "newest", source: "Newest source", sourceUrl: "https://example.com/newest", title: "Newest article" }],
              text: "Newest summary",
            }],
            title: "Geopolityka",
          },
      ],
      summary: "Najnowszy digest obejmuje jedną wiadomość. Poniżej znajdziesz przekrojowy obraz sytuacji w dostępnych materiałach.",
      summaryReferences: [{ newsItemId: "newest", source: "Newest source", sourceUrl: "https://example.com/newest", title: "Newest article", whatHappened: "Newest summary" }],
      watchlist: [],
    });
  });
});

describe("validateDigestBriefQuality", () => {
  it("reports editorial length and section guidance as warnings", () => {
    const brief = fallbackDigestBrief(
      Array.from({ length: 4 }, (_, index) => ({
        category: `category-${index}`,
        importanceScore: 90,
        publishedAt: null,
        source: `Source ${index}`,
        sourceCount: 1,
        summary: "Krótki materiał.",
        title: `Article ${index}`,
        whyInteresting: null,
      })),
    );

    const quality = validateDigestBriefQuality(brief);

    expect(quality.valid).toBe(true);
    expect(quality.hardErrors).toEqual([]);
    expect(quality.warnings.length).toBeGreaterThan(0);
  });

  it("accepts a focused 280-500 word briefing", () => {
    const words = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(" ");
    const brief = parseDigestBriefJson(JSON.stringify({
      coverageNote: words("ograniczenie", 12),
      highlights: [{ articleIndex: 0, whatHappened: "Fakt", whyItMatters: "Znaczenie" }],
      sections: Array.from({ length: 3 }, (_, index) => ({
        category: `category-${index}`,
        paragraphs: [{ articleIndexes: [index], text: words(`sekcja${index}-`, 100) }],
        title: `Sekcja ${index}`,
      })),
      summary: words("lead", 70),
      watchlist: [{ articleIndexes: [0], signal: words("sygnal", 8), why: words("powod", 12) }],
    }), 4);

    expect(brief).not.toBeNull();
    expect(brief?.readingTimeMinutes).toBe(3);
    expect(validateDigestBriefQuality(brief!).valid).toBe(true);
  });

  it("rejects describing the same source story in multiple section paragraphs", () => {
    const brief = fallbackDigestBrief(
      Array.from({ length: 4 }, (_, index) => ({
        category: `category-${index}`,
        importanceScore: 90,
        publishedAt: null,
        source: `Source ${index}`,
        sourceCount: 1,
        summary: `Materiał ${index}`,
        title: `Article ${index}`,
        whyInteresting: null,
      })),
    );
    brief.sections[1]!.paragraphs[0]!.articleIndexes = [0];

    expect(validateDigestBriefQuality(brief).reasons).toContain(
      "each source story must be described in only one section paragraph",
    );
  });

  it("allows reader-facing content written in English", () => {
    const repeated = (word: string, count: number) => Array.from({ length: count }, () => word).join(" ");
    const brief = parseDigestBriefJson(JSON.stringify({
      coverageNote: repeated("the", 12),
      highlights: [{ articleIndex: 0, whatHappened: "The company changed its policy.", whyItMatters: "This may affect customers." }],
      sections: Array.from({ length: 4 }, (_, index) => ({
        category: `category-${index}`,
        paragraphs: [{ articleIndexes: [index], text: repeated("the", 95) }],
        title: `The section ${index}`,
      })),
      summary: repeated("the", 70),
      watchlist: [{ articleIndexes: [0], signal: repeated("the", 8), why: repeated("the", 12) }],
    }), 4);

    expect(brief).not.toBeNull();
    expect(validateDigestBriefQuality(brief!).valid).toBe(true);
  });

  it("rejects a parseable briefing with a critical attribution error", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    const responseContent = JSON.stringify({
      coverageNote: "No material limitations were reported.",
      highlights: [{ articleIndex: 0, whatHappened: "A company changed its policy.", whyItMatters: "Customers may be affected." }],
      sections: [
        { category: "business", title: "Policy change", paragraphs: [{ articleIndexes: [0], text: "The company changed its policy." }] },
        { category: "technology", title: "Customer impact", paragraphs: [{ articleIndexes: [0], text: "The same change may affect customers." }] },
      ],
      summary: "A company changed its policy and customers may be affected.",
      summaryArticleIndexes: [0],
      watchlist: [],
    });
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ choices: [{ message: { content: responseContent } }] }),
      ok: true,
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateDigestBriefWithNvidia({
      articles: [{
        category: "business",
        evidence: { status: "full_text" },
        importanceScore: 90,
        publishedAt: null,
        source: "Source",
        sourceCount: 1,
        summary: "Material",
        title: "Title",
        whyInteresting: null,
      }],
      attempt: 1,
      interestProfile: { feedTargets: {}, preferredKeywords: [] },
    });

    expect(result.status).toBe("retryable_failure");
    expect(result.brief.coverageNote).toContain("bez syntezy AI");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("digestBriefWithNvidia", () => {
  it("reports a retryable failure instead of finalizing a fallback when the model times out", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    vi.stubEnv("NVIDIA_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b");
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason || new Error("aborted")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const generationPromise = generateDigestBriefWithNvidia({
      articles: [{
        category: "business",
        importanceScore: 90,
        publishedAt: null,
        source: "Source",
        sourceCount: 1,
        summary: "Material",
        title: "Tytuł",
        whyInteresting: null,
      }],
      attempt: 1,
      interestProfile: { feedTargets: {}, preferredKeywords: [] },
    });
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await generationPromise;

    expect(result).toMatchObject({
      model: "google/diffusiongemma-26b-a4b-it",
      status: "retryable_failure",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the active fallback model on the second durable attempt", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    vi.stubEnv("NVIDIA_FALLBACK_MODEL", "openai/gpt-oss-20b");
    const responseContent = JSON.stringify({
      coverageNote: "Brak danych.",
      highlights: [{ articleIndex: 0, whatHappened: "Fakt", whyItMatters: "Znaczenie" }],
      sections: [{
        category: "business",
        paragraphs: [{ articleIndexes: [0], text: "Krótka sekcja." }],
        title: "Gospodarka",
      }],
      summary: "Krótki lead.",
      watchlist: [],
    });
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => ({
      json: async () => ({ choices: [{ message: { content: responseContent } }] }),
      ok: true,
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateDigestBriefWithNvidia({
      articles: [{
        category: "business",
        importanceScore: 90,
        publishedAt: null,
        source: "Source",
        sourceCount: 1,
        summary: "Material",
        title: "Tytuł",
        whyInteresting: null,
      }],
      attempt: 2,
      interestProfile: { feedTargets: {}, preferredKeywords: [] },
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(result.model).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
    expect(result.status).toBe("generated");
    expect(request.model).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses DiffusionGemma-compatible sampling without an unsupported JSON response format", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    vi.stubEnv("NVIDIA_FALLBACK_MODEL", "google/diffusiongemma-26b-a4b-it");
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => ({
      json: async () => ({ choices: [{ message: { content: "{}" } }] }),
      ok: true,
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await generateDigestBriefWithNvidia({
      articles: [{
        category: "business",
        importanceScore: 90,
        publishedAt: null,
        source: "Source",
        sourceCount: 1,
        summary: "Material",
        title: "Tytuł",
        whyInteresting: null,
      }],
      attempt: 2,
      interestProfile: { feedTargets: {}, preferredKeywords: [] },
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(request.response_format).toBeUndefined();
    expect(request.temperature).toBe(1);
    expect(request.top_p).toBe(0.95);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("accepts a parseable terse briefing with warnings and one request", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    vi.stubEnv("NVIDIA_MODEL", "google/diffusiongemma-26b-a4b-it");
    const words = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(" ");
    const terseBrief = JSON.stringify({
      coverageNote: words("ograniczenie", 10),
      highlights: [{ articleIndex: 0, whatHappened: "Fakt", whyItMatters: "Znaczenie" }],
      sections: Array.from({ length: 3 }, (_, index) => ({
        category: `category-${index}`,
        paragraphs: [{ articleIndexes: [index], text: words(`krotka${index}-`, 35) }],
        title: `Sekcja ${index}`,
      })),
      summary: words("lead", 45),
      summaryArticleIndexes: [0],
      watchlist: [{ articleIndexes: [0], signal: words("sygnal", 8), why: words("powod", 12) }],
    });
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      const prompt = String(request.messages?.at(-1)?.content || "");
      const content = prompt.includes("Rozwiń lead")
        ? words("l", 70)
        : prompt.includes("Rozwiń sekcję")
          ? words("s", 100)
          : terseBrief;
      return {
        json: async () => ({ choices: [{ message: { content } }] }),
        ok: true,
        status: 200,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateDigestBriefWithNvidia({
      articles: Array.from({ length: 3 }, (_, index) => ({
        category: `category-${index}`,
        importanceScore: 90,
        publishedAt: null,
        source: `Source ${index}`,
        sourceCount: 1,
        summary: `Materiał ${index}`,
        title: `Tytuł ${index}`,
        whyInteresting: null,
      })),
      attempt: 1,
      interestProfile: { feedTargets: {}, preferredKeywords: [] },
    });

    expect(result.status).toBe("generated");
    expect(validateDigestBriefQuality(result.brief).warnings.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not make a correction request for a parseable response", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    const responseContent = JSON.stringify({
      coverageNote: "Brak danych.",
      highlights: [{ articleIndex: 0, whatHappened: "Fakt", whyItMatters: "Znaczenie" }],
      sections: [{
        category: "business",
        paragraphs: [{ articleIndexes: [0], text: "Krótka sekcja." }],
        title: "Gospodarka",
      }],
      summary: "Krótki lead.",
      watchlist: [],
    });
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => ({
      json: async () => ({ choices: [{ message: { content: responseContent } }] }),
      ok: true,
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await digestBriefWithNvidia({
      articles: [{
        category: "business",
        importanceScore: 90,
        publishedAt: null,
        source: "Source",
        sourceCount: 1,
        summary: "Material",
        title: "Tytuł",
        whyInteresting: null,
      }],
      interestProfile: { feedTargets: {}, preferredKeywords: [] },
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const [, init] of fetchMock.mock.calls) {
      const request = JSON.parse(String(init?.body));
      expect(request.response_format).toEqual({ type: "json_object" });
    }
    expect(result.coverageNote).toBe("Brak danych.");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps the daily briefing request small enough for the free inference endpoint", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    const responseContent = JSON.stringify({
      coverageNote: "Brak danych.",
      highlights: [{ articleIndex: 9, whatHappened: "Fakt", whyItMatters: "Znaczenie" }],
      sections: [{
        category: "business",
        paragraphs: [{ articleIndexes: [9], text: "Krótka sekcja." }],
        title: "Gospodarka",
      }],
      summary: "Krótki lead.",
      watchlist: [],
    });
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => ({
      json: async () => ({ choices: [{ message: { content: responseContent } }] }),
      ok: true,
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await digestBriefWithNvidia({
      articles: Array.from({ length: 20 }, (_, index) => ({
        category: "business",
        evidence: { fullTextSourceCount: 1, independentSourceCount: 1, status: "full_text" },
        importanceScore: 90,
        publishedAt: null,
        source: `Source ${index}`,
        sourceCount: 1,
        summary: `Material ${index} ${"x".repeat(900)}`,
        title: `Tytuł ${index}`,
        whyInteresting: null,
      })),
      interestProfile: { feedTargets: {}, preferredKeywords: [] },
    });
    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(firstRequest.messages[1].content).toContain('"articleIndex": 9');
    expect(firstRequest.messages[1].content).not.toContain('"articleIndex": 10');
    expect(firstRequest.messages[1].content).not.toContain("x".repeat(801));
    expect(firstRequest.messages[1].content).toContain('"status": "full_text"');
    expect(firstRequest.max_tokens).toBe(2_400);
    expect(firstRequest.messages[0].content).toContain("Nie podawaj w tekście łącznej liczby newsów");
    expect(firstRequest.messages[0].content).toContain("Buduj briefing historia po historii");
    expect(result.highlights[0]?.articleIndex).toBe(9);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("waits 60 seconds for the initial response without correcting a timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason || new Error("aborted")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const digestPromise = digestBriefWithNvidia({
      articles: [{
        category: "business",
        importanceScore: 90,
        publishedAt: null,
        source: "Source",
        sourceCount: 1,
        summary: "Material",
        title: "Tytuł",
        whyInteresting: null,
      }],
      interestProfile: { feedTargets: {}, preferredKeywords: [] },
    });
    let resolved = false;
    void digestPromise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(59_999);
    const resolvedBeforeTimeout = resolved;
    await vi.advanceTimersByTimeAsync(1);
    await digestPromise;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();

    expect(resolvedBeforeTimeout).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not correct invalid output in the same invocation", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ choices: [{ message: { content: "invalid JSON" } }] }),
        ok: true,
        status: 200,
      })
      .mockImplementationOnce((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason || new Error("aborted")), { once: true });
      }));
    vi.stubGlobal("fetch", fetchMock);

    const digestPromise = digestBriefWithNvidia({
      articles: [{
        category: "business",
        importanceScore: 90,
        publishedAt: null,
        source: "Source",
        sourceCount: 1,
        summary: "Material",
        title: "Tytuł",
        whyInteresting: null,
      }],
      interestProfile: { feedTargets: {}, preferredKeywords: [] },
    });
    let resolved = false;
    void digestPromise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(1);
    const resolvedBeforeTimeout = resolved;
    await digestPromise;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();

    expect(resolvedBeforeTimeout).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
