import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ScopeInput = z.object({
  scope: z.enum(["vendor", "admin"]),
  shopId: z.string().uuid(),
});

export const importProductImagesZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    ScopeInput.extend({ zipBase64: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertShopAccess, importImagesZip } = await import(
      "./product-images-zip.server"
    );
    await assertShopAccess(context.userId, data.shopId, data.scope);
    return importImagesZip({ shopId: data.shopId, zipBase64: data.zipBase64 });
  });

export const exportProductImagesZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    ScopeInput.extend({ productIds: z.array(z.string().uuid()).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertShopAccess, exportImagesZip } = await import(
      "./product-images-zip.server"
    );
    await assertShopAccess(context.userId, data.shopId, data.scope);
    return exportImagesZip({ shopId: data.shopId, productIds: data.productIds });
  });
