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
  const count = input.count ?? 6;
  const location = [input.city, input.region, input.country]
    .filter(Boolean)
    .join(", ");

  const prompt = `You are a restaurant culinary ops assistant for Restman.
Return ONLY valid JSON matching this TypeScript shape:
{
  "items": [{
    "name": string,
    "category": "Starters" | "Main Course" | "Breads" | "Desserts" | "Beverages" | string,
    "sellingPrice": number,
    "ingredients": [{
      "name": string,
      "category": "Proteins" | "Dairy" | "Vegetables" | "Dry Goods" | "Spices" | "Oils" | string,
      "unit": "KG" | "G" | "L" | "ML" | "PIECE" | "PACKET",
      "grossQuantity": number,
      "shrinkageMarginPercent": number,
      "estimatedCostPerUnit": number
    }]
  }]
}

Restaurant: ${input.restaurantName}
Cuisine: ${input.cuisineType}
Location: ${location || "unspecified"}
Currency: ${input.currency ?? "USD"}
Existing ingredients to prefer when relevant: ${(input.existingIngredients ?? []).join(", ") || "none"}
Focus: ${input.focus ?? "signature dishes with measurable BOM yield"}
Generate exactly ${count} menu items with realistic portion BOMs for kitchen yield tracking.
Use practical units (G/ML for portion-level, KG/L for bulk proteins/oils when per-portion amounts are large).
Prices and costs should be realistic for the location.`;

  return generateJson(prompt, menuRecipeSuggestionSchema);
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
