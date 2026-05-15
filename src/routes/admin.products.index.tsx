import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { ProductsPage } from "./admin.products";

export const Route = createFileRoute("/admin/products/")({
  component: () => (
    <PermissionGate perm="product_validation">
      <ProductsPage />
    </PermissionGate>
  ),
});
