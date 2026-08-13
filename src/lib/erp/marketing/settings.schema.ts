import { z } from "zod";

/** Phase 8 — Marketing settings (single JSON row in `app_settings`). */
export const MARKETING_SETTINGS_KEY = "marketing.settings";

export const ATTRIBUTION_SOURCES = [
  "utm",
  "pixel",
  "product_link",
  "phone_match",
  "manual",
] as const;

export const marketingSettingsSchema = z.object({
  attribution: z.object({
    clickWindowDays: z.number().int().min(1).max(90).default(7),
    viewWindowDays: z.number().int().min(0).max(30).default(1),
    priority: z.array(z.enum(ATTRIBUTION_SOURCES)).default([...ATTRIBUTION_SOURCES]),
    autoApply: z.boolean().default(true),
    autoApplyMinConfidence: z.number().min(0).max(1).default(0.8),
  }),
  targets: z.object({
    defaultTargetRoas: z.number().min(0).max(100).default(3),
    defaultTargetCpa: z.number().min(0).max(1_000_000).default(400),
    includeManualExpenses: z.boolean().default(true),
    agencyFeePct: z.number().min(0).max(100).default(0),
  }),
  alerts: z.object({
    defaultLookbackDays: z.number().int().min(1).max(90).default(7),
    roasDropPct: z.number().min(0).max(100).default(30),
    cpaSpikePct: z.number().min(0).max(500).default(40),
    frequencyMax: z.number().min(1).max(20).default(3),
    returnRatePct: z.number().min(0).max(100).default(25),
    lowStockUnits: z.number().int().min(0).max(10_000).default(10),
  }),
  utm: z.object({
    defaultSource: z.string().max(40).default("facebook"),
    defaultMedium: z.string().max(40).default("paid_social"),
    campaignNaming: z.string().max(200).default("{brand}_{objective}_{product}_{date}"),
  }),
});

export type MarketingSettings = z.infer<typeof marketingSettingsSchema>;

export const DEFAULT_MARKETING_SETTINGS: MarketingSettings = marketingSettingsSchema.parse({
  attribution: {},
  targets: {},
  alerts: {},
  utm: {},
});

/** Merge partial/legacy stored JSON onto the defaults so the UI never breaks. */
export function normalizeMarketingSettings(raw: unknown): MarketingSettings {
  const v = (raw ?? {}) as Record<string, any>;
  const d = DEFAULT_MARKETING_SETTINGS;
  const parsed = marketingSettingsSchema.safeParse({
    attribution: { ...d.attribution, ...(v.attribution ?? {}) },
    targets: { ...d.targets, ...(v.targets ?? {}) },
    alerts: { ...d.alerts, ...(v.alerts ?? {}) },
    utm: { ...d.utm, ...(v.utm ?? {}) },
  });
  return parsed.success ? parsed.data : d;
}
