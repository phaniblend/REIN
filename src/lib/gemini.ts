import { GoogleGenAI } from "@google/genai";
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

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

function modelName() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

async function generateJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: modelName(),
    contents: prompt,
    config: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Menu generation returned invalid content");
    parsed = JSON.parse(match[0]);
  }
  return schema.parse(parsed);
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
  const location = [input.city, input.region, input.country].filter(Boolean).join(", ");

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
      "grossQuantity": number, // quantity per 1 portion sold
      "shrinkageMarginPercent": number, // cook/trim loss 0-50
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
Label confidence honestly. Prefer public industry norms + location cost-of-living adjustments.

Return ONLY JSON:
{
  "cuisineType": string,
  "locationLabel": string,
  "sampleConfidence": "low" | "medium" | "high",
  "disclaimer": string,
  "averages": {
    "foodCostPercentOfSales": number,
    "grocerySpendVsTheoreticalUsagePercent": number,
    "groceryBoughtVsSoldRatio": number, // purchases / theoretical recipe usage; >1 means buy more than recipe needs
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
Location: ${locationLabel}
Focus metrics: groceries bought vs theoretically sold (recipe yield), food cost %, spoilage, unaccounted shrink — averages only.`;

  return generateJson(prompt, locationCuisineStatsSchema);
}
