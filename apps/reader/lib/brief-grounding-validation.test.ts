import { expect, it } from "vitest";

import type { NvidiaDigestBrief } from "./ai-summary";
import { unsupportedNumericClaims } from "./brief-grounding-validation";
import { buildBriefInputV2 } from "./digest-brief-job";

const input = buildBriefInputV2({
  articles: [{ category: "business", evidence: { status: "full_text" }, importanceScore: 90, index: 0,
    newsItemId: "story", publishedAt: null, source: "Publisher", sourceCount: 1,
    storyClusterId: "cluster", summary: "Acme announced 12 new contracts.", title: "Acme expansion",
    whyInteresting: null, sourceMaterials: [{ contentMode: "readable", source: "Publisher",
      text: "Acme announced 12 new contracts worth $8.2 million in 2026.", title: "Acme expansion", url: "https://example.com" }] }],
  interestProfile: { feedTargets: {}, preferredKeywords: [] },
  omitted: { insufficientEvidence: 0, overLimit: 0 },
}).payload;

function brief(text: string): NvidiaDigestBrief {
  return { coverageNote: "", highlights: [], readingTimeMinutes: 1, summary: "", summaryArticleIndexes: [], watchlist: [],
    sections: [{ category: "business", title: "Acme", paragraphs: [{ articleIndexes: [0], text }] }] };
}

it("accepts Polish bln in the production Korean budget source", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "Prezydent Korei Południowej przedstawił projekt budżetu w wysokości 820,9 bln wonów. Z kolei 4,6 bln wonów wesprze budowę modelu AI. Nakłady na obronność wzrosną do 73,3 bln wonów.";
  expect(unsupportedNumericClaims(brief("Budżet wynosi 820,9 bln wonów, AI otrzyma 4,6 biliona, a obronność 73,3 bln wonów."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Budżet wynosi 820,9 mld wonów."), article)).toEqual([expect.stringContaining("820900000000")]);
});

it.each(["$", "£", "€"])("recognizes financial tn shorthand after %s", currency => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = `The decline has knocked nearly ${currency}1tn in value off the exchange and erased about ${currency}2tn in a month.`;
  expect(unsupportedNumericClaims(brief("Giełda straciła 1 bilion w tydzień i 2 bln w miesiąc."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Giełda straciła 1 miliard."), article)).toEqual([expect.stringContaining("1000000000")]);
});

it.each(["biliona", "bln", "bln."])("accepts the production SpaceX valuation written with %s", unit => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "At current valuations, SpaceX and Tesla rank as the world's seventh- and eleventh-largest companies, respectively, with a combined market capitalisation of about $3.5 trillion.";
  expect(unsupportedNumericClaims(brief(`SpaceX i Tesla mają łączną kapitalizację około 3,5 ${unit} dolarów.`), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Kapitalizacja wynosi 3,5 miliarda dolarów."), article)).toEqual([expect.stringContaining("3500000000")]);
});

it.each(["$", "£", "€"])("recognizes the production facility cost written as %s1.4m", currency => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = `Inaugurated in August, the ${currency}1.4m facility aims to modernise India's handloom sector by combining traditional weaving heritage with contemporary technology.`;
  expect(unsupportedNumericClaims(brief("Placówka kosztuje 1,4 mln."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Placówka kosztuje 1,4 mld."), article)).toEqual([expect.stringContaining("1400000000")]);
  expect(unsupportedNumericClaims(brief("Placówka kosztuje 1,4."), article)).toEqual([expect.stringContaining("sources: 1.4.")]);
});

it("does not treat an ambiguous English bln source as confirmation of Polish trillions", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The market value of the company is $3.5 bln.";
  expect(unsupportedNumericClaims(brief("Kapitalizacja wynosi 3,5 bln dolarów."), article)).toEqual([expect.stringContaining("3500000000000")]);
});

it("does not interpret a metre suffix as a monetary million", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The textile is 1.4m wide.";
  expect(unsupportedNumericClaims(brief("Koszt wynosi 1,4 mln dolarów."), article)).toEqual([expect.stringContaining("1400000")]);
});

it.each(["$14-billion", "$14‐billion", "$14‑billion"])("recognizes the production arms deal amount written as %s", (amount) => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = `In May, he put on hold a ${amount} arms deal. The arms sales deal remains under review.`;
  expect(unsupportedNumericClaims(brief("Wstrzymano umowę zbrojeniową wartą 14 mld dolarów."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Umowa jest warta 14 mln dolarów."), article)).toEqual([expect.stringContaining("14000000")]);
});

it("recognizes billion-parameter model shorthand from the production GKE article", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "Google reports startup latency reductions of 89%, with a 70B parameter model loading in 37 seconds and an 8B model in 15 seconds.";
  expect(unsupportedNumericClaims(brief("Model o 70 mld parametrów startuje w 37 sekund, a model o 8 mld w 15 sekund."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Model ma 70 mln parametrów."), article)).toEqual([expect.stringContaining("70000000")]);
  expect(unsupportedNumericClaims(brief("Model ma 70 miliardów parametrów, a drugi 8 miliardów."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Modele 70B i 8B uruchamiają się w 37 i 15 sekund."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Uruchomiono 70 modeli i 8 maszyn."), article)).toEqual([expect.stringContaining("70, 8")]);
});

it.each([["tysięcy", "thousand"], ["tysiące", "thousand"], ["tysiącach", "thousand"], ["miliardów", "billion"], ["bilionów", "trillion"]])("normalizes %s in sources and output", (polish, english) => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = `The figure is 8 ${english}.`;
  expect(unsupportedNumericClaims(brief(`Wartość: 8 ${polish}.`), article)).toEqual([]);
  article.articles[0].sourceMaterials[0].text = `Wartość: 8 ${polish}.`;
  expect(unsupportedNumericClaims(brief(`Wartość: 8 ${english}.`), article)).toEqual([]);
});

it.each(["milion", "miliona", "miliony", "milionów", "milionach", "milionami"])("normalizes the Polish unit %s without dropping its magnitude", unit => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The figure is 8.2 million.";
  expect(unsupportedNumericClaims(brief(`Wartość: 8,2 ${unit}.`), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Wartość: 8,2 miliarda."), article)).toEqual([expect.stringContaining("8200000000")]);
});

it("does not interpret bytes or model identifiers as billions", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The packet has 70B of data. The machine is B70 and the part is 8B.";
  expect(unsupportedNumericClaims(brief("Model ma 70 mld parametrów oraz 8 mld parametrów."), article)).toEqual([expect.stringContaining("70000000000, 8000000000")]);
});

it("still rejects a derived total absent from the production tariff source", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The two countries reached consensus on more favourable tariff treatment for $30 billion of non-sensitive goods in each direction.";
  expect(unsupportedNumericClaims(brief("Porozumienie dotyczy towarów za 60 mld dolarów."), article)).toEqual([expect.stringContaining("60000000000")]);
});

it("rejects a new quantity that is absent from the cited story", () => {
  expect(unsupportedNumericClaims(brief("Acme podpisała 13 nowych umów."), input))
    .toEqual([expect.stringContaining("numbers absent from its cited sources: 13")]);
});

it("accepts supported counts and comma-formatted decimals", () => {
  expect(unsupportedNumericClaims(brief("Acme podpisała 12 umów o wartości 8,2 mln dolarów w 2026 roku."), input))
    .toEqual([]);
});

it("accepts a decimal when an upstream extractor inserted a space after its separator", () => {
  const extracted = structuredClone(input);
  extracted.articles[0].sourceMaterials[0].text = "Acme announced 12 contracts worth $8. 2 million.";
  expect(unsupportedNumericClaims(brief("Acme podpisała 12 umów o wartości 8,2 mln dolarów."), extracted))
    .toEqual([]);
});

it("does not treat a feed summary as confirmation when the full article is available", () => {
  const conflicting = structuredClone(input);
  conflicting.articles[0].summary = "Acme announced 13 new contracts.";
  expect(unsupportedNumericClaims(brief("Acme podpisała 13 nowych umów."), conflicting))
    .toEqual([expect.stringContaining("numbers absent from its cited sources: 13")]);
});

it("reads figures with attached units and a decade paraphrase", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The deficit is £21bn and imports were 19.1bn kg. The site seeks 90MW, its owner plans a $35bn listing, and launch may slip into the mid-2030s.";
  expect(unsupportedNumericClaims(brief("Deficyt wyniósł 21 mld funtów, import 19,1 mld kg, a projekt wymaga 90 MW. Firma planuje ofertę za 35 mld dolarów i uruchomienie w latach 30."), article))
    .toEqual([]);
});

it("accepts the production Kiteworks shutdown window translated to a 24-hour clock", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "In Central Europe, shut down between 4:00 a.m. and 10:00 a.m. In New York, from 10:00 p.m. Friday to 4:00 a.m. Saturday.";
  expect(unsupportedNumericClaims(brief("W Europie od 04:00 do 10:00, w Nowym Jorku od 22:00 do 04:00."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Firma wyłączy 22 serwery."), article)).toEqual([expect.stringContaining("sources: 22")]);
  expect(unsupportedNumericClaims(brief("Okno zaczyna się o 22:30."), article)).toEqual([expect.stringContaining("time:22:30")]);
});

it("handles noon, midnight and AM/PM without minutes in either direction", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The windows start at 12 AM, 12 p.m. and 9:15 PM.";
  expect(unsupportedNumericClaims(brief("Okna zaczynają się o 00:00, 12:00 i 21:15."), article)).toEqual([]);
  article.articles[0].sourceMaterials[0].text = "The window starts at 22:00.";
  expect(unsupportedNumericClaims(brief("Start: 10:00 p.m."), article)).toEqual([]);
});


it("keeps comma-separated quantities separate instead of inventing a decimal", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The groups signed 12, 13 and 14 contracts.";
  expect(unsupportedNumericClaims(brief("Grupy podpisały odpowiednio 12 oraz 13 umów."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Wartość wynosi 12,13."), article)).toEqual([expect.stringContaining("12.13")]);
});

it("normalizes space-grouped thousands without merging ordinary lists", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "There are 1500 contracts worth 1250000 dollars.";
  expect(unsupportedNumericClaims(brief("Jest 1 500 umów o wartości 1\u202f250\u00a0000 dolarów."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Jest 1 501 umów."), article)).toEqual([expect.stringContaining("1501")]);
  article.articles[0].sourceMaterials[0].text = "There are 1 500 contracts.";
  expect(unsupportedNumericClaims(brief("Jest 1500 umów."), article)).toEqual([]);
});

it("recognizes English grouped thousands from the production source without accepting changed quantities", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The council said the petition from residents gathered more than 7,707 signatures in just a few days. The projections for the region show 66,800 deaths, with 31,400 in Nigeria.";
  expect(unsupportedNumericClaims(brief("Petycja zebrała 7707 podpisów, prognozy wskazują 66 800 i 31 400 zgonów."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Petycja zebrała 7708 podpisów."), article)).toEqual([expect.stringContaining("7708")]);
  expect(unsupportedNumericClaims(brief("Wartość wynosi 7,707."), article)).toEqual([expect.stringContaining("7.707")]);
});

it("does not reinterpret a Polish decimal comma as a thousands separator", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "Wynik wynosi 7,707 metra, a wartość pomiaru jest dokładna.";
  expect(unsupportedNumericClaims(brief("Wynik to 7,707 metra."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Wynik to 7707 metrów."), article)).toEqual([expect.stringContaining("7707")]);
});

it("recognizes exact dozen expressions without treating dozens as an exact count", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The British ministry is inviting up to a dozen companies to submit proposals for the platform.";
  expect(unsupportedNumericClaims(brief("Resort zaprasza do 12 firm."), article)).toEqual([]);
  article.articles[0].sourceMaterials[0].text = "The ministry invited two dozen companies and half a dozen labs.";
  expect(unsupportedNumericClaims(brief("Zaproszono 24 firmy i 6 laboratoriów."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Zaproszono 12 firm."), article)).toEqual([expect.stringContaining("12")]);
  article.articles[0].sourceMaterials[0].text = "The ministry invited dozens of companies to the platform.";
  expect(unsupportedNumericClaims(brief("Zaproszono 12 firm."), article)).toEqual([expect.stringContaining("12")]);
});

it("interprets grouped numbers in titles in the same source context as the body", () => {
  const article = structuredClone(input);
  article.articles[0].title = "7,707 signatures";
  article.articles[0].sourceMaterials[0].title = "7,707 signatures";
  article.articles[0].sourceMaterials[0].text = "The petition from the residents gathered more than 7,707 signatures for the protest.";
  expect(unsupportedNumericClaims(brief("Zebrano 7707 podpisów."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Wartość wynosi 7,707."), article)).toEqual([expect.stringContaining("7.707")]);
});

it("compares full quantities when a briefing uses thousands or millions", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The projections from the researchers show 451,000 deaths and 66,800 in the region, with 50,000 stars and 3.29 million downloads.";
  expect(unsupportedNumericClaims(brief("Prognoza wynosi 451 tys. i 66,8 tys. zgonów; projekt ma 50 tys. gwiazdek oraz 3,29 mln pobrań."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Prognoza wynosi 451 mln zgonów."), article)).toEqual([expect.stringContaining("451000000")]);
  expect(unsupportedNumericClaims(brief("Projekt ma 50 gwiazdek."), article)).toEqual([expect.stringContaining("50")]);
});

it("does not let an equal coefficient conceal a thousand-fold magnitude error", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The company has $8.2 million in revenue.";
  expect(unsupportedNumericClaims(brief("Przychód to 8,2 mln dolarów."), article)).toEqual([]);
  expect(unsupportedNumericClaims(brief("Przychód to 8,2 mld dolarów."), article)).toEqual([expect.stringContaining("8200000000")]);
});
