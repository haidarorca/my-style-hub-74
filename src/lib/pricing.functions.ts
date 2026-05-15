import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InputSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(200),
  destinationCountryId: z.string().uuid().nullable().optional(),
});

export interface DisplayPrice {
  product_id: string;
  base_price: number;
  final_price: number;
  commission_rate: number;
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
      base_price: Number(r.base_price ?? 0),
      final_price: Number(r.final_price ?? 0),
      commission_rate: Number(r.commission_rate ?? 0),
    }));
  });
