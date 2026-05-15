import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InputSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(200),
  destinationCountryId: z.string().uuid().nullable().optional(),
});

const LinesInputSchema = z.object({
  lines: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().nullable().optional(),
  })).min(1).max(200),
  destinationCountryId: z.string().uuid().nullable().optional(),
});

export interface DisplayPrice {
  product_id: string;
  variant_id: string | null;
  base_price: number;
  final_price: number;
  commission_rate: number;
  commission_amount: number;
}

/**
 * Public pricing endpoint. Returns the final (commission-included) price the
 * buyer should see, based on the optional delivery country. Never returns
 * the commission rule id to the client.
 */
export const getDisplayPrices = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<DisplayPrice[]> => {
    const args: { _product_ids: string[]; _destination_country_id?: string } = {
      _product_ids: data.productIds,
    };
    if (data.destinationCountryId) args._destination_country_id = data.destinationCountryId;
    const { data: rows, error } = await supabaseAdmin.rpc("get_display_prices", args);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      product_id: r.product_id,
      variant_id: null,
      base_price: Number(r.base_price ?? 0),
      final_price: Number(r.final_price ?? 0),
      commission_rate: Number(r.commission_rate ?? 0),
      commission_amount: Number(r.commission_amount ?? 0),
    }));
  });

export const getDisplayPriceLines = createServerFn({ method: "POST" })
  .inputValidator((input) => LinesInputSchema.parse(input))
  .handler(async ({ data }): Promise<DisplayPrice[]> => {
    const rows = await Promise.all(data.lines.map(async (line) => {
      const args: Record<string, string | null> = {
        _product_id: line.productId,
        _variant_id: line.variantId ?? null,
        _destination_country_id: data.destinationCountryId ?? null,
      };
      const { data: result, error } = await (supabaseAdmin as any).rpc("get_product_display_price", args);
      if (error) throw new Error(error.message);
      const r = Array.isArray(result) ? result[0] : null;
      return {
        product_id: line.productId,
        variant_id: line.variantId ?? null,
        base_price: Number(r?.base_price ?? 0),
        final_price: Number(r?.final_price ?? 0),
        commission_rate: Number(r?.commission_rate ?? 0),
        commission_amount: Number(r?.commission_amount ?? 0),
      };
    }));
    return rows;
  });
