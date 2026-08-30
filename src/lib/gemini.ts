import { z } from "zod";

const unitSchema = z.enum(["KG", "G", "L", "ML", "PIECE", "PACKET"]);

export const menuRecipeSuggestionSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      sellingPrice: z.number().positive(),
      ingredients: z.array(
        z.object({
          name: z.string(),
          category: z.string(),
          unit: unitSchema,
          grossQuantity: z.number().positive(),
          shrinkageMarginPercent: z.number().min(0).max(50).default(5),
          estimatedCostPerUnit: z.number().positive().optional(),
        }),
      ),
    }),
  ),
});

export type MenuRecipeSuggestion = z.infer<typeof menuRecipeSuggestionSchema>;

export const locationCuisineStatsSchema = z.object({
  cuisineType: z.string(),
  locationLabel: z.string(),
  sampleConfidence: z.enum(["low", "medium", "high"]),
  disclaimer: z.string(),
  averages: z.object({
    foodCostPercentOfSales: z.number(),
    grocerySpendVsTheoreticalUsagePercent: z.number(),
    groceryBoughtVsSoldRatio: z.number(),
    typicalGrossMarginPercent: z.number(),
    spoilageWastePercentOfPurchases: z.number(),
    unaccountedShrinkPercentOfUsage: z.number(),
    weeklyGrocerySpendUsd: z.number().optional(),
    weeklyFoodSalesUsd: z.number().optional(),
  }),
  notes: z.array(z.string()).default([]),
  benchmarks: z.array(
    z.object({
      metric: z.string(),
      value: z.number(),
      unit: z.string(),
      interpretation: z.string(),
    }),
  ),
});

export type LocationCuisineStats = z.infer<typeof locationCuisineStatsSchema>;

function resolveApiKey() {
  const raw =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    "";
  const key = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^Bearer\s+/i, "");
  if (!key) {
    throw new Error(
      "Menu generation is not configured. Set GEMINI_API_KEY on Railway.",
    );
  }
  return key;
}

function modelCandidates() {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const defaults = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
  ];
  return [...new Set([preferred, ...defaults].filter(Boolean))] as string[];
}

function friendlyAuthError() {
  return "Menu generation auth failed. Set GEMINI_API_KEY on Railway to a key from https://aistudio.google.com/apikey (full key, no quotes), then redeploy.";
}

async function generateContentOnce(
  model: string,
  prompt: string,
  apiKey: string,
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      },
    }),
  });

  const bodyText = await res.text();
  let body: {
    error?: { code?: number; message?: string; status?: string };
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string }[] };
    }[];
  };
  try {
    body = JSON.parse(bodyText) as typeof body;
  } catch {
    throw new Error("Menu generation returned an invalid response");
  }

  if (!res.ok) {
    const code = body.error?.code ?? res.status;
    const status = body.error?.status ?? "";
    const msg = body.error?.message ?? bodyText;
    console.error("[menu-gen]", model, code, status, msg);

    if (
      code === 401 ||
      status === "UNAUTHENTICATED" ||
      /ACCESS_TOKEN_TYPE_UNSUPPORTED|invalid authentication/i.test(msg)
    ) {
      throw new Error(friendlyAuthError());
    }
    if (code === 404 || /not found|no longer available/i.test(msg)) {
      throw new Error(`MODEL_UNAVAILABLE:${model}`);
    }
    if (code === 429) {
      throw new Error("Menu generation is rate-limited. Try again in a minute.");
    }
    throw new Error("Menu generation failed. Try again shortly.");
  }

  const candidate = body.candidates?.[0];
  const text =
    candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error("Menu generation returned empty content");
  }
  return { text, finishReason: candidate?.finishReason ?? "" };
}

/** Pull complete objects out of a truncated `"items": [ ...` array. */
function extractCompleteItems(text: string): unknown[] {
  const marker = text.match(/"items"\s*:\s*\[/);
  if (!marker || marker.index === undefined) return [];

  const items: unknown[] = [];
  let i = marker.index + marker[0].length;

  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i]!)) i += 1;
    if (i >= text.length || text[i] === "]") break;
    if (text[i] !== "{") break;

    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let j = i; j < text.length; j += 1) {
      const ch = text[j]!;
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) break;
    try {
      items.push(JSON.parse(text.slice(i, end + 1)));
    } catch {
      break;
    }
    i = end + 1;
  }

  return items;
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // ignore and try salvage
  }

  const items = extractCompleteItems(cleaned);
  if (items.length > 0) return { items };

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      const salvaged = extractCompleteItems(match[0]);
      if (salvaged.length > 0) return { items: salvaged };
    }
  }

  throw new Error("Menu generation returned incomplete JSON. Try again.");
}

async function generateJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const apiKey = resolveApiKey();
  const models = modelCandidates();
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { text } = await generateContentOnce(model, prompt, apiKey);
        const parsed = parseJsonLoose(text);
        return schema.parse(parsed);
      } catch (err) {
        lastError = err;
        if (
          err instanceof Error &&
          err.message.startsWith("MODEL_UNAVAILABLE:")
        ) {
          break;
        }
        // Retry once on parse/validation issues with same model.
        if (attempt === 0) continue;
        // Next model only for unavailable; otherwise fail after retry.
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Menu generation failed");
}

type MenuBatch = { label: string; count: number; detail: string };

/** Keep each Gemini call small so JSON doesn't truncate mid-array. */
function splitBatches(batches: MenuBatch[], maxPerCall = 4): MenuBatch[] {
  const out: MenuBatch[] = [];
  for (const batch of batches) {
    let remaining = batch.count;
    let part = 1;
    while (remaining > 0) {
      const n = Math.min(maxPerCall, remaining);
      out.push({
        label:
          batch.count > maxPerCall
            ? `${batch.label} (part ${part})`
            : batch.label,
        count: n,
        detail: batch.detail,
      });
      remaining -= n;
      part += 1;
    }
  }
  return out;
}

function indianMenuBatches(): MenuBatch[] {
  return [
    {
      label: "Appetizers / Starters",
      count: 8,
      detail:
        'Mix of vegetarian and non-vegetarian Indian starters. Category must be exactly "Appetizers".',
    },
    {
      label: "Soups & Salads",
      count: 4,
      detail:
        'Indian restaurant soups and salads (veg and non-veg). Category must be exactly "Soups & Salads".',
    },
    {
      label: "Main Course — Vegetarian",
      count: 8,
      detail:
        'Classic vegetarian Indian mains (paneer, dal, sabzi, kofta). Category must be exactly "Main Course — Veg".',
    },
    {
      label: "Main Course — Non-Vegetarian",
      count: 8,
      detail:
        'Classic non-veg Indian mains (chicken, mutton, fish, egg). Category must be exactly "Main Course — Non-Veg".',
    },
    {
      label: "Breads, Rice & Sides",
      count: 6,
      detail:
        'Naan, roti, rice, raita, and sides. Use category "Breads & Rice" or "Sides".',
    },
    {
      label: "Desserts & Beverages",
      count: 6,
      detail:
        'Indian desserts and drinks. Use category "Desserts" or "Beverages".',
    },
  ];
}

function genericMenuBatches(total: number): MenuBatch[] {
  const appetizers = Math.max(6, Math.round(total * 0.2));
  const mains = Math.max(10, Math.round(total * 0.4));
  const sides = Math.max(6, Math.round(total * 0.15));
  const desserts = Math.max(4, total - appetizers - mains - sides);
  return [
    {
      label: "Appetizers",
      count: appetizers,
      detail: 'Starters/appetizers. Category "Appetizers".',
    },
    {
      label: "Main Course",
      count: mains,
      detail: 'Main courses covering the cuisine. Category "Main Course".',
    },
    {
      label: "Sides / Breads / Rice",
      count: sides,
      detail: 'Sides, breads, rice. Category "Sides" or "Breads & Rice".',
    },
    {
      label: "Desserts & Beverages",
      count: desserts,
      detail: 'Desserts and beverages. Categories "Desserts" or "Beverages".',
    },
  ];
}

export async function suggestMenuAndRecipes(input: {
  cuisineType: string;
  restaurantName: string;
  city?: string;
  region?: string;
  country?: string;
  currency?: string;
  existingIngredients?: string[];
  focus?: string;
  count?: number;
}): Promise<MenuRecipeSuggestion> {
  const requested = Math.min(Math.max(input.count ?? 40, 1), 48);
  const location = [input.city, input.region, input.country]
    .filter(Boolean)
    .join(", ");
  const cuisine = input.cuisineType || "Indian";
  const focus = input.focus ?? "";
  const isIndian = /indian|north indian|south indian|punjabi|mughlai|indo/i.test(
    `${cuisine} ${focus}`,
  );

  const batches = splitBatches(
    isIndian ? indianMenuBatches() : genericMenuBatches(requested),
    4,
  );

  const baseContext = `Restaurant: ${input.restaurantName}
Cuisine: ${cuisine}
Location: ${location || "unspecified"}
Currency: ${input.currency ?? "USD"}
Existing ingredients to prefer when relevant: ${(input.existingIngredients ?? []).slice(0, 40).join(", ") || "none"}
Owner focus note: ${focus || "full dine-in lunch and dinner menu"}`;

  const allItems: MenuRecipeSuggestion["items"] = [];

  for (const batch of batches) {
    const prompt = `You are a restaurant culinary ops assistant for Restman.
Return ONLY valid compact JSON (no markdown, no comments) matching:
{"items":[{"name":string,"category":string,"sellingPrice":number,"ingredients":[{"name":string,"category":string,"unit":"KG"|"G"|"L"|"ML"|"PIECE"|"PACKET","grossQuantity":number,"shrinkageMarginPercent":number,"estimatedCostPerUnit":number}]}]}

${baseContext}

Section: ${batch.label}
${batch.detail}
Generate exactly ${batch.count} distinct dishes.
Keep each BOM lean: 4 to 6 key ingredients only (skip every spice/oil if redundant).
Use portion units (G/ML). Realistic local prices.`;

    try {
      const partial = await generateJson(prompt, menuRecipeSuggestionSchema);
      allItems.push(...partial.items.slice(0, batch.count));
    } catch (err) {
      // Soft-fail a single small batch so one truncated call doesn't wipe the run.
      console.error("[menu-gen] batch failed", batch.label, err);
      if (allItems.length === 0) throw err;
    }
  }

  if (allItems.length === 0) {
    throw new Error("Menu generation returned no dishes. Try again.");
  }

  const seen = new Set<string>();
  const items = allItems.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return menuRecipeSuggestionSchema.parse({ items });
}

export async function getLocationCuisineStats(input: {
  cuisineType: string;
  city: string;
  region?: string;
  country?: string;
}): Promise<LocationCuisineStats> {
  const locationLabel = [input.city, input.region, input.country]
    .filter(Boolean)
    .join(", ");

  const prompt = `You are a restaurant industry analyst for Restman.
Produce AGGREGATE, ANONYMIZED market averages for restaurants of the same cuisine in this location.
Do NOT invent named competitor restaurants. Do NOT claim access to private POS data.
Label confidence honestly.

Return ONLY JSON:
{
  "cuisineType": string,
  "locationLabel": string,
  "sampleConfidence": "low" | "medium" | "high",
  "disclaimer": string,
  "averages": {
    "foodCostPercentOfSales": number,
    "grocerySpendVsTheoreticalUsagePercent": number,
    "groceryBoughtVsSoldRatio": number,
    "typicalGrossMarginPercent": number,
    "spoilageWastePercentOfPurchases": number,
    "unaccountedShrinkPercentOfUsage": number,
    "weeklyGrocerySpendUsd": number,
    "weeklyFoodSalesUsd": number
  },
  "notes": string[],
  "benchmarks": [{
    "metric": string,
    "value": number,
    "unit": string,
    "interpretation": string
  }]
}

Cuisine: ${input.cuisineType}
Location: ${locationLabel}`;

  return generateJson(prompt, locationCuisineStatsSchema);
}
