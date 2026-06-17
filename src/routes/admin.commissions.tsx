import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Search,
  Store,
  Package,
  Percent,
  Banknote,
  Calculator,
  Check,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Layers,
  ArrowRight,
  Eye,
  Pencil,
  X,
  Filter,
  Hash,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface Vendor {
  id: string;
  shop_name: string;
  full_name: string;
  avatar_url?: string;
  product_count: number;
  country: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  image_url?: string;
  price: number; // prix de vente (sans commission)
  vendor_id: string;
  category: string;
  commission_rate: number; // en %
  commission_amount: number; // en FCFA
  supplier_price?: number; // prix fournisseur
  sale_price?: number; // prix de vente final
}

interface CommissionRule {
  id: string;
  scope: "global" | "vendor" | "category" | "product";
  vendor_id?: string;
  product_id?: string;
  category_id?: string;
  rate_percent: number;
  is_enabled: boolean;
}

// ─── Donnees de demo ────────────────────────────────────────────

const VENDORS: Vendor[] = [
  { id: "v1", shop_name: "Boutique Fatou", full_name: "Fatou Ndiaye", product_count: 45, country: "Senegal" },
  { id: "v2", shop_name: "Style Luxe", full_name: "Amadou Diallo", product_count: 32, country: "Senegal" },
  { id: "v3", shop_name: "Chic & Moi", full_name: "Aminata Sow", product_count: 28, country: "Cote d'Ivoire" },
  { id: "v4", shop_name: "Golden Touch", full_name: "Moussa Ba", product_count: 67, country: "Senegal" },
  { id: "v5", shop_name: "Mode Express", full_name: "Mariama Diop", product_count: 19, country: "Mali" },
  { id: "v6", shop_name: "Elegance Pro", full_name: "Ibrahima Fall", product_count: 54, country: "Senegal" },
  { id: "v7", shop_name: "Trendy Shop", full_name: "Sophie Martin", product_count: 41, country: "France" },
  { id: "v8", shop_name: "Wax Paradise", full_name: "Kadiatou Kone", product_count: 73, country: "Guinea" },
];

const PRODUCTS: Product[] = [
  { id: "p1", code: "WZ-001", name: "Pagne Wax Authentique", image_url: "https://images.unsplash.com/photo-1590736969955-71cc94901144?w=200&h=200&fit=crop", price: 15000, vendor_id: "v1", category: "Pagnes", commission_rate: 15, commission_amount: 2250, supplier_price: 8000 },
  { id: "p2", code: "RB-102", name: "Robe Soiree Rouge", image_url: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=200&h=200&fit=crop", price: 45000, vendor_id: "v1", category: "Robes", commission_rate: 20, commission_amount: 9000, supplier_price: 25000 },
  { id: "p3", code: "JP-203", name: "Jupe Plissee Bleue", image_url: "https://images.unsplash.com/photo-1583496661160-fb5886a0ujj?w=200&h=200&fit=crop", price: 22000, vendor_id: "v1", category: "Jupes", commission_rate: 12, commission_amount: 2640, supplier_price: 12000 },
  { id: "p4", code: "CH-305", name: "Chemise Homme Blanc", image_url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=200&h=200&fit=crop", price: 18000, vendor_id: "v1", category: "Chemises", commission_rate: 15, commission_amount: 2700, supplier_price: 9000 },
  { id: "p5", code: "SC-401", name: "Sac a Main Cuir", image_url: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=200&h=200&fit=crop", price: 35000, vendor_id: "v1", category: "Accessoires", commission_rate: 18, commission_amount: 6300, supplier_price: 18000 },
  { id: "p6", code: "SH-502", name: "Chaussures Talons", image_url: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=200&h=200&fit=crop", price: 28000, vendor_id: "v2", category: "Chaussures", commission_rate: 15, commission_amount: 4200, supplier_price: 15000 },
  { id: "p7", code: "MX-601", name: "Montre Luxe Or", image_url: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=200&h=200&fit=crop", price: 125000, vendor_id: "v2", category: "Montres", commission_rate: 10, commission_amount: 12500, supplier_price: 75000 },
  { id: "p8", code: "LT-701", name: "Lunettes de Soleil", image_url: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=200&h=200&fit=crop", price: 12000, vendor_id: "v2", category: "Accessoires", commission_rate: 20, commission_amount: 2400, supplier_price: 6000 },
  { id: "p9", code: "EN-801", name: "Ensemble Wax 3pcs", image_url: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=200&h=200&fit=crop", price: 38000, vendor_id: "v3", category: "Ensembles", commission_rate: 18, commission_amount: 6840, supplier_price: 20000 },
  { id: "p10", code: "PT-901", name: "Portefeuille Cuir", image_url: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=200&h=200&fit=crop", price: 9500, vendor_id: "v3", category: "Accessoires", commission_rate: 25, commission_amount: 2375, supplier_price: 4500 },
  { id: "p11", code: "VB-112", name: "Veste Bomber", image_url: "https://images.unsplash.com/photo-1551028919-ac76c9028d1e?w=200&h=200&fit=crop", price: 32000, vendor_id: "v4", category: "Vestes", commission_rate: 15, commission_amount: 4800, supplier_price: 18000 },
  { id: "p12", code: "TN-223", name: "T-shirt Nike Original", image_url: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200&h=200&fit=crop", price: 8500, vendor_id: "v4", category: "T-shirts", commission_rate: 12, commission_amount: 1020, supplier_price: 5000 },
];

const COMMISSION_RULES: CommissionRule[] = [
  { id: "r1", scope: "global", rate_percent: 15, is_enabled: true },
  { id: "r2", scope: "vendor", vendor_id: "v1", rate_percent: 18, is_enabled: true },
  { id: "r3", scope: "vendor", vendor_id: "v2", rate_percent: 12, is_enabled: true },
  { id: "r4", scope: "product", product_id: "p7", rate_percent: 10, is_enabled: true },
];

// ─── Helpers ────────────────────────────────────────────────────

const fmtF = (n: number) => n.toLocaleString("fr-FR") + " FCFA";
const fmtP = (n: number) => n.toFixed(1).replace(".0", "") + "%";

// ─── Page ───────────────────────────────────────────────────────

export const Route = createFileRoute("/admin/commissions")({
  component: CommissionsPage,
});

function CommissionsPage() {
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [searchProduct, setSearchProduct] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("vendors");

  // Dialog state
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    productId?: string;
    mode: "percent" | "amount";
    value: string;
    supplierPrice: string;
    salePrice: string;
  }>({ open: false, mode: "percent", value: "", supplierPrice: "", salePrice: "" });

  const [bulkDialog, setBulkDialog] = useState<{
    open: boolean;
    mode: "percent" | "amount";
    value: string;
  }>({ open: false, mode: "percent", value: "" });

  // ── Derived ──────────────────────────────────────────────────

  const filteredVendors = useMemo(() => {
    return VENDORS.filter((v) =>
      v.shop_name.toLowerCase().includes(searchProduct.toLowerCase()) ||
      v.full_name.toLowerCase().includes(searchProduct.toLowerCase())
    );
  }, [searchProduct]);

  const vendorProducts = useMemo(() => {
    if (!selectedVendor) return [];
    return PRODUCTS.filter(
      (p) =>
        p.vendor_id === selectedVendor &&
        (p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
          p.code.toLowerCase().includes(searchProduct.toLowerCase()))
    );
  }, [selectedVendor, searchProduct]);

  const selectedVendorData = useMemo(
    () => VENDORS.find((v) => v.id === selectedVendor),
    [selectedVendor]
  );

  const stats = useMemo(() => {
    const prods = selectedVendor ? vendorProducts : PRODUCTS;
    const totalProducts = prods.length;
    const avgRate =
      totalProducts > 0
        ? prods.reduce((s, p) => s + p.commission_rate, 0) / totalProducts
        : 0;
    const totalCommission = prods.reduce((s, p) => s + p.commission_amount, 0);
    const totalRevenue = prods.reduce((s, p) => s + p.price, 0);
    return { totalProducts, avgRate, totalCommission, totalRevenue };
  }, [vendorProducts, selectedVendor]);

  // ── Handlers ─────────────────────────────────────────────────

  const toggleProduct = (id: string) => {
    const next = new Set(selectedProducts);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProducts(next);
  };

  const selectAll = () => {
    const ids = vendorProducts.map((p) => p.id);
    const allSelected = ids.every((id) => selectedProducts.has(id));
    if (allSelected) {
      const next = new Set(selectedProducts);
      ids.forEach((id) => next.delete(id));
      setSelectedProducts(next);
    } else {
      const next = new Set(selectedProducts);
      ids.forEach((id) => next.add(id));
      setSelectedProducts(next);
    }
  };

  const openEditDialog = (product: Product) => {
    setEditDialog({
      open: true,
      productId: product.id,
      mode: "percent",
      value: String(product.commission_rate),
      supplierPrice: String(product.supplier_price ?? product.price * 0.6),
      salePrice: String(product.price),
    });
  };

  const calculateFromMode = (
    mode: "percent" | "amount",
    value: number,
    supplierPrice: number
  ) => {
    if (mode === "percent") {
      const commissionAmount = (supplierPrice * value) / 100;
      const salePrice = supplierPrice + commissionAmount;
      return { salePrice, commissionAmount, ratePercent: value };
    } else {
      const salePrice = supplierPrice + value;
      const ratePercent = supplierPrice > 0 ? (value / supplierPrice) * 100 : 0;
      return { salePrice, commissionAmount: value, ratePercent };
    }
  };

  const handleSaveEdit = () => {
    if (!editDialog.productId) return;
    const val = parseFloat(editDialog.value);
    const supplierPrice = parseFloat(editDialog.supplierPrice);
    if (isNaN(val) || val < 0) return;

    const result = calculateFromMode(editDialog.mode, val, supplierPrice);

    // In real app: update product commission
    console.log("Save commission:", {
      productId: editDialog.productId,
      supplierPrice,
      salePrice: result.salePrice,
      commissionAmount: result.commissionAmount,
      ratePercent: result.ratePercent,
    });

    setEditDialog({ ...editDialog, open: false });
  };

  const handleBulkApply = () => {
    const val = parseFloat(bulkDialog.value);
    if (isNaN(val) || val < 0) return;

    console.log("Bulk apply:", {
      productIds: Array.from(selectedProducts),
      mode: bulkDialog.mode,
      value: val,
    });

    setBulkDialog({ ...bulkDialog, open: false });
    setSelectedProducts(new Set());
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Percent className="h-5 w-5 text-violet-600" />
              Espace Commissions
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Gestion des commissions par boutique et par produit
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">
              {VENDORS.length} boutiques
            </Badge>
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
              {PRODUCTS.length} produits
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="vendors" className="text-xs">
              <Store className="h-3.5 w-3.5 mr-1.5" />
              Par Boutique
            </TabsTrigger>
            <TabsTrigger value="overview" className="text-xs">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Vue d Ensemble
            </TabsTrigger>
            <TabsTrigger value="rules" className="text-xs">
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Regles Globales
            </TabsTrigger>
          </TabsList>

          {/* ─── ONGLET PAR BOUTIQUE ────────────────────────── */}
          <TabsContent value="vendors" className="space-y-4">
            {!selectedVendor ? (
              /* Liste des boutiques */
              <>
                {/* Search */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Rechercher une boutique..."
                      value={searchProduct}
                      onChange={(e) => setSearchProduct(e.target.value)}
                      className="pl-9 text-sm h-10"
                    />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {filteredVendors.length} boutiques
                  </Badge>
                </div>

                {/* Vendor Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredVendors.map((vendor) => {
                    const vendorProds = PRODUCTS.filter((p) => p.vendor_id === vendor.id);
                    const avgRate =
                      vendorProds.length > 0
                        ? vendorProds.reduce((s, p) => s + p.commission_rate, 0) / vendorProds.length
                        : 0;
                    return (
                      <Card
                        key={vendor.id}
                        className="cursor-pointer hover:shadow-md hover:border-violet-300 transition-all group"
                        onClick={() => {
                          setSelectedVendor(vendor.id);
                          setSearchProduct("");
                          setSelectedProducts(new Set());
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center flex-shrink-0">
                              <Store className="h-6 w-6 text-violet-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm text-slate-900 truncate group-hover:text-violet-700 transition-colors">
                                {vendor.shop_name}
                              </h3>
                              <p className="text-xs text-slate-500">{vendor.full_name}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-[10px] h-5">
                                  <Package className="h-3 w-3 mr-1" />
                                  {vendor.product_count} produits
                                </Badge>
                                <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 text-emerald-700 border-emerald-200">
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                  {fmtP(avgRate)}
                                </Badge>
                              </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-violet-500 transition-colors flex-shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Detail boutique */
              <>
                {/* Back + Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedVendor(null);
                        setSearchProduct("");
                        setSelectedProducts(new Set());
                      }}
                      className="text-slate-500"
                    >
                      <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
                      Retour
                    </Button>
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
                      <Store className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <h2 className="font-bold text-lg text-slate-900">
                        {selectedVendorData?.shop_name}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {selectedVendorData?.full_name} · {vendorProducts.length} produits
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="text-xs bg-violet-100 text-violet-800 border-violet-200">
                      Commission moy: {fmtP(stats.avgRate)}
                    </Badge>
                  </div>
                </div>

                {/* Stats cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <Card className="bg-white">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-slate-500 uppercase">Produits</p>
                      <p className="text-xl font-bold text-slate-900">{stats.totalProducts}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-slate-500 uppercase">Commission moy</p>
                      <p className="text-xl font-bold text-violet-700">{fmtP(stats.avgRate)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-slate-500 uppercase">Total commissions</p>
                      <p className="text-xl font-bold text-emerald-700">{fmtF(stats.totalCommission)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-slate-500 uppercase">Chiffre d affaires</p>
                      <p className="text-xl font-bold text-slate-900">{fmtF(stats.totalRevenue)}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Search + Actions */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Rechercher un produit..."
                      value={searchProduct}
                      onChange={(e) => setSearchProduct(e.target.value)}
                      className="pl-9 text-sm h-9"
                    />
                  </div>
                  {selectedProducts.size > 0 && (
                    <div className="flex items-center gap-2">
                      <Badge className="text-xs bg-violet-100 text-violet-800">
                        {selectedProducts.size} selectionne
                      </Badge>
                      <Button
                        size="sm"
                        className="text-xs h-9 bg-violet-600 hover:bg-violet-700"
                        onClick={() => setBulkDialog({ open: true, mode: "percent", value: "" })}
                      >
                        <Percent className="h-3.5 w-3.5 mr-1" />
                        Appliquer en masse
                      </Button>
                    </div>
                  )}
                </div>

                {/* Products Table */}
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="w-10">
                            <Checkbox
                              checked={
                                vendorProducts.length > 0 &&
                                vendorProducts.every((p) => selectedProducts.has(p.id))
                              }
                              onCheckedChange={selectAll}
                            />
                          </TableHead>
                          <TableHead className="text-xs">Produit</TableHead>
                          <TableHead className="text-xs">Code</TableHead>
                          <TableHead className="text-xs text-right">Prix fournisseur</TableHead>
                          <TableHead className="text-xs text-right">Prix vente</TableHead>
                          <TableHead className="text-xs text-right">Commission %</TableHead>
                          <TableHead className="text-xs text-right">Commission FCFA</TableHead>
                          <TableHead className="text-xs text-center">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vendorProducts.map((product) => (
                          <TableRow key={product.id} className="hover:bg-slate-50">
                            <TableCell>
                              <Checkbox
                                checked={selectedProducts.has(product.id)}
                                onCheckedChange={() => toggleProduct(product.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                  {product.image_url ? (
                                    <img
                                      src={product.image_url}
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Package className="h-4 w-4 text-slate-400" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-slate-900">{product.name}</p>
                                  <p className="text-[10px] text-slate-500">{product.category}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-slate-500">
                              {product.code}
                            </TableCell>
                            <TableCell className="text-xs text-right text-slate-600">
                              {fmtF(product.supplier_price ?? product.price * 0.6)}
                            </TableCell>
                            <TableCell className="text-xs text-right font-medium text-slate-900">
                              {fmtF(product.price)}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  product.commission_rate >= 20
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : product.commission_rate >= 15
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-slate-50 text-slate-600 border-slate-200"
                                }`}
                              >
                                {fmtP(product.commission_rate)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-right font-medium text-emerald-700">
                              {fmtF(product.commission_amount)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => openEditDialog(product)}
                              >
                                <Pencil className="h-3.5 w-3.5 text-slate-400" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ─── ONGLET VUE D'ENSEMBLE ──────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-violet-50 to-indigo-50 border-violet-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-violet-800 flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Commission moyenne globale
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-violet-900">
                    {fmtP(
                      PRODUCTS.reduce((s, p) => s + p.commission_rate, 0) / PRODUCTS.length
                    )}
                  </p>
                  <Progress
                    value={
                      (PRODUCTS.reduce((s, p) => s + p.commission_rate, 0) / PRODUCTS.length)
                    }
                    className="h-2 mt-2 bg-violet-200"
                  />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-800 flex items-center gap-2">
                    <Banknote className="h-4 w-4" />
                    Total commissions potentielles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-emerald-900">
                    {fmtF(PRODUCTS.reduce((s, p) => s + p.commission_amount, 0))}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-50 to-sky-50 border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-blue-800 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Chiffre d affaires total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-900">
                    {fmtF(PRODUCTS.reduce((s, p) => s + p.price, 0))}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Tableau par boutique */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Store className="h-4 w-4 text-slate-500" />
                  Performances par boutique
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">Boutique</TableHead>
                      <TableHead className="text-xs text-right">Produits</TableHead>
                      <TableHead className="text-xs text-right">Commission moy</TableHead>
                      <TableHead className="text-xs text-right">Total commissions</TableHead>
                      <TableHead className="text-xs text-right">CA total</TableHead>
                      <TableHead className="text-xs text-right">Part</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {VENDORS.map((vendor) => {
                      const vProds = PRODUCTS.filter((p) => p.vendor_id === vendor.id);
                      const vTotal = vProds.reduce((s, p) => s + p.commission_amount, 0);
                      const vAvg =
                        vProds.length > 0
                          ? vProds.reduce((s, p) => s + p.commission_rate, 0) / vProds.length
                          : 0;
                      const vRevenue = vProds.reduce((s, p) => s + p.price, 0);
                      const grandTotal = PRODUCTS.reduce((s, p) => s + p.commission_amount, 0);
                      const share = grandTotal > 0 ? (vTotal / grandTotal) * 100 : 0;
                      return (
                        <TableRow key={vendor.id} className="hover:bg-slate-50">
                          <TableCell className="text-sm font-medium">{vendor.shop_name}</TableCell>
                          <TableCell className="text-xs text-right">{vProds.length}</TableCell>
                          <TableCell className="text-xs text-right">
                            <Badge variant="outline" className="text-[10px]">
                              {fmtP(vAvg)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium text-emerald-700">
                            {fmtF(vTotal)}
                          </TableCell>
                          <TableCell className="text-xs text-right">{fmtF(vRevenue)}</TableCell>
                          <TableCell className="text-xs text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Progress value={share} className="h-1.5 w-16" />
                              <span className="text-slate-500">{fmtP(share)}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── ONGLET REGLES GLOBALES ─────────────────────── */}
          <TabsContent value="rules" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4 text-slate-500" />
                  Regles de commission actives
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">Portee</TableHead>
                      <TableHead className="text-xs">Cible</TableHead>
                      <TableHead className="text-xs text-right">Taux</TableHead>
                      <TableHead className="text-xs text-center">Actif</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {COMMISSION_RULES.map((rule) => (
                      <TableRow key={rule.id} className="hover:bg-slate-50">
                        <TableCell className="text-xs">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              rule.scope === "global"
                                ? "bg-violet-50 text-violet-700 border-violet-200"
                                : rule.scope === "vendor"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : rule.scope === "category"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {rule.scope === "global"
                              ? "Global"
                              : rule.scope === "vendor"
                              ? "Boutique"
                              : rule.scope === "category"
                              ? "Categorie"
                              : "Produit"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {rule.scope === "global"
                            ? "Toutes les boutiques"
                            : rule.scope === "vendor"
                            ? VENDORS.find((v) => v.id === rule.vendor_id)?.shop_name ?? "—"
                            : rule.scope === "product"
                            ? PRODUCTS.find((p) => p.id === rule.product_id)?.name ?? "—"
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium">
                          {fmtP(rule.rate_percent)}
                        </TableCell>
                        <TableCell className="text-center">
                          {rule.is_enabled ? (
                            <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-red-400 mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* ─── DIALOG EDITION COMMISSION ───────────────────── */}
      <Dialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog({ ...editDialog, open })}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Calculator className="h-5 w-5 text-violet-600" />
              Modifier la commission
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Mode selector */}
            <div className="flex items-center gap-2">
              <Button
                variant={editDialog.mode === "percent" ? "default" : "outline"}
                size="sm"
                className={`text-xs flex-1 ${
                  editDialog.mode === "percent" ? "bg-violet-600" : ""
                }`}
                onClick={() => setEditDialog({ ...editDialog, mode: "percent" })}
              >
                <Percent className="h-3.5 w-3.5 mr-1.5" />
                Commission en %
              </Button>
              <Button
                variant={editDialog.mode === "amount" ? "default" : "outline"}
                size="sm"
                className={`text-xs flex-1 ${
                  editDialog.mode === "amount" ? "bg-violet-600" : ""
                }`}
                onClick={() => setEditDialog({ ...editDialog, mode: "amount" })}
              >
                <Banknote className="h-3.5 w-3.5 mr-1.5" />
                Montant fixe (FCFA)
              </Button>
            </div>

            {/* Prix fournisseur */}
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">
                Prix fournisseur
              </label>
              <div className="relative">
                <Input
                  type="number"
                  value={editDialog.supplierPrice}
                  onChange={(e) =>
                    setEditDialog({ ...editDialog, supplierPrice: e.target.value })
                  }
                  className="text-sm pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  FCFA
                </span>
              </div>
            </div>

            {/* Commission input */}
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">
                {editDialog.mode === "percent"
                  ? "Commission (%)"
                  : "Commission (FCFA)"}
              </label>
              <div className="relative">
                <Input
                  type="number"
                  value={editDialog.value}
                  onChange={(e) => setEditDialog({ ...editDialog, value: e.target.value })}
                  className="text-sm pr-12"
                  placeholder={editDialog.mode === "percent" ? "15" : "1500"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  {editDialog.mode === "percent" ? "%" : "FCFA"}
                </span>
              </div>
            </div>

            {/* Auto-calculation preview */}
            {(() => {
              const val = parseFloat(editDialog.value);
              const supplierPrice = parseFloat(editDialog.supplierPrice);
              if (isNaN(val) || isNaN(supplierPrice) || supplierPrice <= 0) return null;
              const result = calculateFromMode(editDialog.mode, val, supplierPrice);
              return (
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-600">Apercu du calcul</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-slate-500">Prix fournisseur</p>
                      <p className="text-sm font-bold text-slate-900">{fmtF(supplierPrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Commission</p>
                      <p className="text-sm font-bold text-violet-700">
                        {fmtF(result.commissionAmount)}
                      </p>
                      <p className="text-[10px] text-violet-500">({fmtP(result.ratePercent)})</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Prix de vente</p>
                      <p className="text-sm font-bold text-emerald-700">
                        {fmtF(result.salePrice)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditDialog({ ...editDialog, open: false })}
            >
              Annuler
            </Button>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={handleSaveEdit}>
              <Check className="h-4 w-4 mr-1.5" />
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG BULK APPLY ───────────────────────────── */}
      <Dialog
        open={bulkDialog.open}
        onOpenChange={(open) => setBulkDialog({ ...bulkDialog, open })}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Percent className="h-5 w-5 text-violet-600" />
              Appliquer en masse ({selectedProducts.size} produits)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Button
                variant={bulkDialog.mode === "percent" ? "default" : "outline"}
                size="sm"
                className={`text-xs flex-1 ${
                  bulkDialog.mode === "percent" ? "bg-violet-600" : ""
                }`}
                onClick={() => setBulkDialog({ ...bulkDialog, mode: "percent" })}
              >
                <Percent className="h-3.5 w-3.5 mr-1.5" />
                Commission en %
              </Button>
              <Button
                variant={bulkDialog.mode === "amount" ? "default" : "outline"}
                size="sm"
                className={`text-xs flex-1 ${
                  bulkDialog.mode === "amount" ? "bg-violet-600" : ""
                }`}
                onClick={() => setBulkDialog({ ...bulkDialog, mode: "amount" })}
              >
                <Banknote className="h-3.5 w-3.5 mr-1.5" />
                Montant fixe (FCFA)
              </Button>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">
                {bulkDialog.mode === "percent" ? "Commission (%)" : "Montant (FCFA)"}
              </label>
              <div className="relative">
                <Input
                  type="number"
                  value={bulkDialog.value}
                  onChange={(e) => setBulkDialog({ ...bulkDialog, value: e.target.value })}
                  className="text-sm pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  {bulkDialog.mode === "percent" ? "%" : "FCFA"}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBulkDialog({ ...bulkDialog, open: false })}>
              Annuler
            </Button>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={handleBulkApply}>
              <Check className="h-4 w-4 mr-1.5" />
              Appliquer a {selectedProducts.size} produits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CommissionsPage;
