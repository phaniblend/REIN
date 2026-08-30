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
        temperature: 0.5,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    }),
  });

  const bodyText = await res.text();
  let body: {
    error?: { code?: number; message?: string; status?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
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

  const text =
    body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    "";
  if (!text.trim()) {
    throw new Error("Menu generation returned empty content");
  }
  return text;
}

async function generateJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const apiKey = resolveApiKey();
  const models = modelCandidates();
  let lastError: unknown;

  for (const model of models) {
    try {
      const text = await generateContentOnce(model, prompt, apiKey);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("Menu generation returned invalid content");
        parsed = JSON.parse(match[0]);
      }
      return schema.parse(parsed);
    } catch (err) {
      lastError = err;
      if (err instanceof Error && err.message.startsWith("MODEL_UNAVAILABLE:")) {
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Menu generation failed");
}

type MenuBatch = { label: string; count: number; detail: string };

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
  const isIndian = /indian|north indian|south indian|punjabi|mughlai|indo/i.test(
    cuisine,
  );

  const batches = isIndian ? indianMenuBatches() : genericMenuBatches(requested);

  const baseContext = `Restaurant: ${input.restaurantName}
Cuisine: ${cuisine}
Location: ${location || "unspecified"}
Currency: ${input.currency ?? "USD"}
Existing ingredients to prefer when relevant: ${(input.existingIngredients ?? []).join(", ") || "none"}
Owner focus note: ${input.focus ?? "full dine-in lunch and dinner menu"}`;

  const allItems: MenuRecipeSuggestion["items"] = [];

  for (const batch of batches) {
    const prompt = `You are a restaurant culinary ops assistant for Restman.
Return ONLY valid JSON matching this TypeScript shape:
{
  "items": [{
    "name": string,
    "category": string,
    "sellingPrice": number,
    "ingredients": [{
      "name": string,
      "category": string,
      "unit": "KG" | "G" | "L" | "ML" | "PIECE" | "PACKET",
      "grossQuantity": number,
      "shrinkageMarginPercent": number,
      "estimatedCostPerUnit": number
    }]
  }]
}

${baseContext}

Generate a FULL menu section for: ${batch.label}
${batch.detail}
Generate exactly ${batch.count} distinct dishes (no duplicates, no placeholders).
Each dish needs a realistic per-portion BOM for kitchen yield tracking.
Use practical units (G/ML for portion-level).
Prices and costs should be realistic for the location and cuisine.`;

    const partial = await generateJson(prompt, menuRecipeSuggestionSchema);
    allItems.push(...partial.items.slice(0, batch.count));
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
