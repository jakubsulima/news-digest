import type { BriefInputV2 } from "./digest-brief-job";
import type { NvidiaDigestBrief } from "./ai-summary";

const modelPattern = /(?:Claude\s+)?(?:Opus|Haiku|Sonnet|Fable)\s+\d+(?:\.\d+)?|(?:GPT|Grok)[-\s]?\d+(?:\.\d+)?(?:\s+(?:Luna|Sol|Terra|Astra|Nano))?/giu;
const pricePairPattern = /\$\s*(\d+(?:[.,]\d+)?)\s*\/\s*\$?\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*USD\s*\/\s*(\d+(?:[.,]\d+)?)\s*USD|\$\s*(\d+(?:[.,]\d+)?)\s*\/\s*(?:million|M)\b[^.!?]{0,45}?\band\s*\$\s*(\d+(?:[.,]\d+)?)\s*\/\s*(?:million|M)\b|(\d+(?:[.,]\d+)?)\s*USD\b[^.!?;]{0,80}?\b(?:i|oraz|and)\s+(\d+(?:[.,]\d+)?)\s*USD\b/giu;

function normalizedModel(value: string) {
  return value.toLowerCase().replace(/^claude\s+/u, "").replace(/\s+/gu, " ").replace(/gpt\s+(?=\d)/u, "gpt-");
}

function pricePairs(text: string) {
  return [...text.matchAll(pricePairPattern)].map((match) => {
    const first = Number((match[1] || match[3] || match[5] || match[7]).replace(",", "."));
    const second = Number((match[2] || match[4] || match[6] || match[8]).replace(",", "."));
    return { index: match.index, pair: `${first}/${second}` };
  });
}

function priceClaims(text: string) {
  const models = [...text.matchAll(modelPattern)].map((match) => ({ name: normalizedModel(match[0]), end: match.index + match[0].length }));
  return pricePairs(text).flatMap((price) => {
    const preceding = models.filter((model) => model.end <= price.index && price.index - model.end <= 140).at(-1);
    if (!preceding) return [];
    const family = preceding.name.match(/^(opus|haiku|sonnet|fable)\s/u)?.[1];
    const followingVersion = family ? [...text.slice(preceding.end, price.index).matchAll(/\b\d+\.\d+\b/gu)].at(-1)?.[0] : null;
    return [{ model: followingVersion ? `${family} ${followingVersion}` : preceding.name, pair: price.pair }];
  });
}

export function unsupportedModelPriceClaims(brief: NvidiaDigestBrief, input: BriefInputV2) {
  const errors: string[] = [];
  const check = (text: string, articleIndexes: number[], label: string) => {
    const materials = [...new Set(articleIndexes)].flatMap((index) => input.articles[index]?.sourceMaterials || []);
    const sourcePairs = materials.flatMap((material) => pricePairs(material.text));
    const sourceClaims = materials.flatMap((material) => priceClaims(material.text));
    for (const claim of priceClaims(text)) {
      const sourceModelsForPrice = sourceClaims.filter((source) => source.pair === claim.pair);
      if (!sourcePairs.some((source) => source.pair === claim.pair)) {
        errors.push(`${label} states price ${claim.pair} for ${claim.model}, but the source does not state that price pair.`);
      } else if (sourceModelsForPrice.length && !sourceModelsForPrice.some((source) => source.model === claim.model)) {
        errors.push(`${label} attributes price ${claim.pair} to ${claim.model}, but the source attributes it to another model.`);
      }
    }
  };
  check(brief.summary, brief.summaryArticleIndexes, "Lead");
  brief.highlights.forEach((highlight) => check(`${highlight.whatHappened} ${highlight.whyItMatters}`, [highlight.articleIndex], `Highlight ${highlight.articleIndex}`));
  brief.sections.forEach((section) => section.paragraphs.forEach((paragraph) =>
    check(paragraph.text, paragraph.articleIndexes, `Section ${paragraph.articleIndexes.join(",")}`)));
  brief.watchlist.forEach((item) => check(`${item.signal} ${item.why}`, item.articleIndexes, "Watchlist"));
  return errors;
}
