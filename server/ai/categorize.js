import { CATEGORY_TAXONOMY } from "../../shared/categories.js";

function extractJsonFromOpenAI(content) {
  const trimmed = String(content || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("```")) {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    return match ? match[1].trim() : trimmed.replace(/```/g, "").trim();
  }
  return trimmed;
}

function normalizeText(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ALLOWED_KEYS = new Set(CATEGORY_TAXONOMY.map((c) => c.key));
const LABEL_BY_KEY = new Map(CATEGORY_TAXONOMY.map((c) => [c.key, c.label]));

function sanitizeKey(key) {
  const k = String(key || "").trim();
  return ALLOWED_KEYS.has(k) ? k : "other";
}

function hardRuleKey(item) {
  const name = normalizeText(item?.name);
  const itemType = item?.itemType;

  if (itemType === "Z" || name.includes("zlava")) return "special.discount";
  if (name.includes("zaloha") || name.includes("pet")) return "special.deposit";

  if (name.includes("sunka") || name.includes("ham")) return "meat.processed.ham";
  if (name.includes("salama") || name.includes("salami") || name.includes("sal.")) return "meat.processed.salami";

  if (name.includes("kukur") || name.includes("kuk")) return "pantry.canned.veg";

  return "";
}

const SYSTEM_PROMPT = `
Si pomocník na kategorizáciu položiek z pokladničných bločkov (Slovensko).

Dostaneš JSON s:
- items: [{id, name, itemType, quantity, price}]
- allowedCategories: [{key, label, parent}]

ÚLOHA:
Pre každý item vyber PRESNE jednu kategóriu z allowedCategories.key.

TVRDÉ PRAVIDLÁ:
- Vráť iba JSON (bez textu, bez markdown).
- Musíš vrátiť výsledok pre každý item v rovnakom poradí.
- categoryKey musí byť iba z allowedCategories.key.
- itemType="Z" alebo "ZĽAVA/ZLAVA" -> "special.discount"
- "ZÁLOHA/ZALOHA" alebo "PET" -> "special.deposit"
- "šunka/sunka/ham" -> "meat.processed.ham" (aj keď je v názve "tost.")
- "sal./saláma/salama/salami" -> "meat.processed.salami"
- "kuk./kukurica" -> "pantry.canned.veg" (nie nápoj)
- Nápoje dávaj len ak je jasný nápoj (voda/limonáda/džús/energy/izotonické/sirup), často s L.

FORMÁT VÝSTUPU:
{ "results": [ { "id": number, "categoryKey": string } ] }
`.trim();

export async function categorizeItemsWithOpenAI(fsJson, { OPENAI_API_KEY, OPENAI_MODEL, logStep } = {}) {
  if (!OPENAI_API_KEY) return { categories: null, debug: { skipped: true, reason: "missing_api_key" } };

  const items = fsJson?.receipt?.items || [];
  if (!Array.isArray(items) || items.length === 0) {
    return { categories: [], debug: { skipped: true, reason: "no_items" } };
  }

  const userPayload = {
    allowedCategories: CATEGORY_TAXONOMY,
    items: items.map((it, idx) => ({
      id: idx,
      name: String(it?.name || "").trim(),
      itemType: it?.itemType ?? null,
      quantity: it?.quantity ?? null,
      price: it?.price ?? null,
    })),
  };

  const responseFormat = {
    type: "json_schema",
    json_schema: {
      name: "receipt_item_categories",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          results: {
            type: "array",
            minItems: items.length,
            maxItems: items.length,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "integer" },
                categoryKey: { type: "string" },
              },
              required: ["id", "categoryKey"],
            },
          },
        },
        required: ["results"],
      },
    },
  };

  const payload = {
    model: OPENAI_MODEL,
    temperature: 0,
    max_completion_tokens: 900,
    response_format: responseFormat,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  };

  logStep?.("ai", "Sending categorize request", { items: items.length, model: OPENAI_MODEL });

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { categories: null, debug: { status: resp.status, error: data?.error || data, requestPayload: payload } };
  }

  const content = data?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(extractJsonFromOpenAI(content));
  const list = parsed?.results;
  if (!Array.isArray(list)) return { categories: null, debug: { error: "invalid_format", raw: parsed } };

  const byId = new Map(list.map((x) => [x.id, sanitizeKey(x.categoryKey)]));

  const categories = items.map((item, idx) => {
    const forced = hardRuleKey(item);
    const key = sanitizeKey(forced || byId.get(idx) || "other");
    return {
      id: idx,
      name: String(item?.name || "").trim(),
      categoryKey: key,
      category: LABEL_BY_KEY.get(key) || "Iné",
    };
  });

  return { categories, debug: { rawResponse: content, parsedModelOutput: parsed } };
}
