# Sync Checkpoint

Last sync: 2026-01-21

## Features included in this build:

1. **AI Category Detection** - Auto-detect product categories (rayon > category > sub-category)
2. **International Order Workflow** - Post-weighing: client validation + admin manual validation
3. **Taobao/1688 AI Import** - Import store products in batches of 10, drafts only, anti-duplicates

## Files added:
- src/components/ai/AiCategoryDetector.tsx
- src/lib/admin-category-generator.functions.ts
- src/components/admin/ImportStoreDialog.tsx
- src/lib/admin-import-store.functions.ts
- src/routes/admin.imports.tsx
- supabase/migrations/20260121_import_store.sql

## Files modified:
- src/routes/admin.tsx (added Imports IA nav link)
- src/lib/shipment-assessments.functions.ts (added adminValidateShipment)
- src/routes/admin.shipments.tsx (dashboard stats + manual validation)
- src/routes/orders.tsx (international shipping section)
- src/routes/orders.$orderId.validate-shipment.tsx (improved client view)
