import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditActiveCourierCod, sendCodCorrectionSms } from "./cod-audit.server";

export const auditActiveCourierCodFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ brandIds: z.array(z.string().uuid()).max(50) }).parse(data))
  .handler(({ data, context }) => auditActiveCourierCod(context, data.brandIds));

export const sendCodCorrectionSmsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ orderIds: z.array(z.string().uuid()).min(1).max(100) }).parse(data))
  .handler(({ data, context }) => sendCodCorrectionSms(context, data.orderIds));