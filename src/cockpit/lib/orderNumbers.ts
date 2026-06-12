// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   ORDER NUMBERS — Numerotation fixe KZ-000001
   
   Logique:
   - Chaque commande recoit un numero KZ-XXXXXX a sa premiere vue
   - Ce numero ne change jamais
   - Stocke dans localStorage (mapping orderId → KZ number)
   - Compteur global pour le prochain numero
   
   References:
   - Admin   : KZ-000245 (visible partout)
   - Client  : KW-A8F2K9 (a implementer plus tard via Supabase)
   - Interne : ORD-028c5d78 (UUID de la commande)
   ═══════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "kawzone_order_numbers";
const STORAGE_COUNTER = "kawzone_order_counter";

interface OrderNumberMap {
  [orderId: string]: string; // orderId → KZ-000001
}

/* ── Charger le mapping ── */
function loadMap(): OrderNumberMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/* ── Sauvegarder le mapping ── */
function saveMap(map: OrderNumberMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/* ── Charger le compteur ── */
function loadCounter(): number {
  try {
    const raw = localStorage.getItem(STORAGE_COUNTER);
    return raw ? parseInt(raw, 10) : 0;
  } catch { return 0; }
}

/* ── Sauvegarder le compteur ── */
function saveCounter(n: number) {
  try { localStorage.setItem(STORAGE_COUNTER, String(n)); } catch { /* ignore */ }
}

/* ── Formatter un numero KZ ── */
function formatKz(n: number): string {
  return `KZ-${String(n).padStart(6, "0")}`;
}

/* ── Generer un numero client aleatoire ── */
function generateClientRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "KW-";
  for (let i = 0; i < 6; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

/* ═══════════════════════════════════════════════════════════════
   API publique
   ═══════════════════════════════════════════════════════════════ */

/** Recuperer ou creer le numero KZ d'une commande */
export function getOrderNumber(orderId: string): string {
  const map = loadMap();
  if (map[orderId]) return map[orderId];

  // Nouveau numero
  const counter = loadCounter() + 1;
  const kzNumber = formatKz(counter);
  map[orderId] = kzNumber;
  saveMap(map);
  saveCounter(counter);
  return kzNumber;
}

/** Recuperer le numero KZ sans creer (retourne null si inexistant) */
export function peekOrderNumber(orderId: string): string | null {
  const map = loadMap();
  return map[orderId] ?? null;
}

/** Recuperer le numero court pour l'affichage (KZ-000001 → KZ-1) */
export function getShortNumber(orderId: string): string {
  const kz = getOrderNumber(orderId);
  return kz.replace(/KZ-0+/, "KZ-");
}

/** Recuperer la reference courte ORD-xxx */
export function getTechnicalRef(orderId: string): string {
  return `ORD-${orderId.slice(0, 8)}`;
}

/** Generer une reference client */
export function getClientRef(orderId: string): string {
  const STORAGE_CLIENT = "kawzone_client_refs";
  try {
    const raw = localStorage.getItem(STORAGE_CLIENT);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (map[orderId]) return map[orderId];
    const ref = generateClientRef();
    map[orderId] = ref;
    localStorage.setItem(STORAGE_CLIENT, JSON.stringify(map));
    return ref;
  } catch {
    return generateClientRef();
  }
}

/** Pre-generer les numeros pour une liste de commandes */
export function preloadOrderNumbers(orderIds: string[]): Record<string, string> {
  const map = loadMap();
  let counter = loadCounter();
  let changed = false;

  for (const id of orderIds) {
    if (!map[id]) {
      counter++;
      map[id] = formatKz(counter);
      changed = true;
    }
  }

  if (changed) {
    saveMap(map);
    saveCounter(counter);
  }

  return map;
}
