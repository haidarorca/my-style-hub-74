# Session Taobao connectée — Plan MVP

## Objectif

Permettre à l'admin de scanner un QR code Taobao depuis l'interface, conserver les cookies de session chiffrés côté serveur, et les injecter automatiquement dans les imports Taobao/Tmall pour contourner les pages de connexion / sécurité.

## Architecture

```text
[Admin Browser]                [Lovable Worker]              [Bright Data]           [Taobao]
     │                              │                             │                     │
     │  ouvre /admin/imports        │                             │                     │
     │  → onglet "Session"          │                             │                     │
     │                              │                             │                     │
     │  EventSource(qr-stream) ──→  │                             │                     │
     │                              │  WSS CDP connect ─────────→ │                     │
     │                              │  Target.createTarget        │                     │
     │                              │  Page.navigate(login.taobao) ────────────────────→│
     │                              │  poll QR canvas (Runtime.evaluate)                │
     │  ← SSE event:"qr" {base64}   │  Page.captureScreenshot(QR) │                     │
     │                              │                             │                     │
     │  affiche QR, scan téléphone ─┼─────────────────────────────┼────────────────────→│
     │                              │  poll URL/user element                            │
     │  ← SSE event:"success"       │  Network.getCookies         │                     │
     │                              │  pgp_sym_encrypt → DB       │                     │
     │                              │                             │                     │
     │  [plus tard] import produit  │                             │                     │
     │                              │  loadCookies (decrypt)      │                     │
     │                              │  WSS Network.setCookies →   │                     │
     │                              │  Page.navigate(produit) ───→│ ───→ (avec session) │
```

## Composants

### 1. Migration DB (pgcrypto + table)
- Active `pgcrypto`
- Table `public.taobao_sessions` (singleton row `id='main'`) :
  - `cookies_encrypted bytea` — `pgp_sym_encrypt(jsonb_text, key)`
  - `user_agent text`, `status text`, `connected_at timestamptz`, `last_check_at timestamptz`, `expires_at timestamptz`, `nickname text`
- RLS : lecture/écriture admins seulement (`has_role` admin/super_admin)
- 2 fonctions SQL SECURITY DEFINER (clé jamais en clair côté client) :
  - `taobao_session_save(_cookies jsonb, _ua text, _nickname text)`
  - `taobao_session_load()` → `jsonb` (cookies déchiffrés)
  - `taobao_session_clear()`
  - Clé lue depuis `current_setting('app.taobao_session_key')` ou paramètre fixé via fonction — en pratique on passe la clé en paramètre depuis le serverFn (qui la lit dans `process.env.TAOBAO_SESSION_KEY`)

### 2. CDP client minimal — `src/lib/scraping/cdp-client.server.ts`
- WebSocket pur (pas puppeteer, pas de deps natives, compatible Workers)
- API : `connect(wssUrl)`, `send(method, params)` → Promise, `createPageTarget()`, `navigate(url)`, `evaluate(expr)`, `screenshotElement(selector)`, `getCookies(urls)`, `setCookies(list)`, `close()`
- Gère message id, timeout 30s par commande

### 3. Helpers session — `src/lib/scraping/taobao-session.server.ts`
- `saveTaobaoCookies(cookies, ua, nickname)` → appelle RPC `taobao_session_save` avec clé
- `loadTaobaoCookies()` → cookies ou null
- `getTaobaoSessionStatus()` → `{ status, connectedAt, expiresAt, nickname }`
- `clearTaobaoSession()`

### 4. Server route SSE — `src/routes/api/admin/taobao-qr-stream.ts`
- `GET` admin-auth (vérif manuelle bearer + has_role admin)
- Stream `ReadableStream` SSE :
  - Connect CDP → login.taobao.com (UA mobile chinois, locale zh-CN)
  - Poll DOM toutes 1s pour `canvas.qrcode-img` (sélecteur officiel)
  - Quand trouvé : screenshot Base64 → `event:qr\ndata:{...}`
  - Continue de poller toutes les 2s pour : URL ≠ login OU élément `.site-nav-user` présent
  - Si timeout 120s → `event:expired`
  - Si succès : récupère cookies (`.taobao.com`, `.tmall.com`), encrypte, save → `event:success {nickname}`
- Toujours close CDP en `finally`

### 5. Server functions admin — `src/lib/taobao-session.functions.ts`
- `getTaobaoSessionStatusFn()` — lecture status pour UI
- `disconnectTaobaoSessionFn()` — supprime cookies + status='disconnected'
- `testTaobaoSessionFn()` — open CDP, set cookies, naviguer vers `i.taobao.com`, vérifier élément user présent. Met à jour status si expiré.

### 6. Intégration scraper — `src/lib/scraping/brightdata.server.ts`
- Dans `scrapeProductViaBrowserApi` (existant) : avant `Page.navigate`, si URL est taobao/tmall → `loadTaobaoCookies()` et `setCookies(...)`. Si session expirée → throw `TaobaoSessionExpiredError` (récupérable, l'admin voit message clair, pas de consommation Bright Data inutile sur la page produit).

### 7. UI admin — nouvel onglet dans `src/routes/admin.imports.tsx`
- Onglet "Session Taobao" :
  - Statut actuel (badge vert/rouge + nickname + expire dans X jours)
  - Bouton **Se connecter via QR** → ouvre dialog avec EventSource sur `/api/admin/taobao-qr-stream`
  - Affiche QR base64 quand reçu, message "Scannez avec l'app Taobao"
  - Sur `success` → toast vert + close dialog + refresh status
  - Sur `expired` → message "QR expiré, réessayez"
  - Bouton **Tester la session** (appelle testTaobaoSessionFn)
  - Bouton **Déconnecter** (appelle disconnectTaobaoSessionFn)

## Sécurité
- Clé `TAOBAO_SESSION_KEY` (secret) jamais exposée au client
- Cookies chiffrés via `pgp_sym_encrypt` (pgcrypto AES) en base
- Mot de passe Taobao **jamais** transité ni stocké — uniquement les cookies post-QR
- Endpoint SSE protégé par bearer admin + check `has_role`
- RLS table verrouillée aux admins

## Hors scope MVP (à ajouter ensuite si besoin)
- Multi-comptes (1 session globale suffit ici)
- Auto-refresh des cookies (juste réafficher QR quand expiré)
- Tmall/1688 séparés (Tmall partage souvent les cookies Taobao ; 1688 a un login distinct → ticket futur)
- WebSocket frontend (EventSource SSE suffit)

## Risques connus
- **Sélecteur QR Taobao peut changer** : on essaie `canvas.J_qrcodeImg`, `.qrcode-img canvas`, `#J_QRCodeImg img` en cascade
- **Bright Data Scraping Browser facturé à la session** : durée moyenne 60s par QR → coût acceptable
- **Cloudflare Worker timeout** : SSE long-poll OK tant que des octets sont envoyés régulièrement (heartbeat toutes 15s)
- **Cookies expirent ~2 semaines** : statut DB inclut `expires_at` calculé à connexion + 14j, UI alerte à -2j

## Ordre d'implémentation
1. Migration DB + RPC pgcrypto
2. CDP client minimal + test connexion
3. SSE route QR + helpers session
4. Server functions status/test/disconnect
5. UI admin
6. Intégration dans scraper produit
7. Test bout-en-bout sur vrai lien Taobao

Estimation : ~700 LoC, 6 fichiers nouveaux, 2 modifiés.