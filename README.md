# ClipWar — maquette Next.js (War Room)

Prototype cliquable du nouveau ClipWar : parcours **clipper** + **admin (Keyan)**, design
gaming premium violet/cyan, navigation mobile, données simulées.

C'est un **projet autonome** (son propre repo, son propre projet Vercel). Il ne touche pas
au ClipWar de production. Une fois validé, on fusionnera.

---

## Structure

```
clipwar-next/
├─ app/
│  ├─ layout.tsx       → layout racine + polices
│  ├─ globals.css      → tout le design (couleurs, composants)
│  └─ page.tsx         → monte l'app
├─ components/
│  ├─ AppShell.tsx     → état, routeur, nav, sheets, compteurs live  (client)
│  ├─ Clipper.tsx      → accueil, campagnes, assets, mes clips, bilan
│  ├─ Admin.tsx        → dashboard, assets/pépites, clippers, anti-triche
│  └─ ui.tsx           → icônes + bandeau HUD
├─ lib/
│  └─ data.ts          → données simulées  ← REMPLACÉ EN PHASE 2 par Supabase
├─ package.json        → Next + React uniquement
├─ next.config.mjs
└─ tsconfig.json
```

Aucune dépendance externe exotique : Vercel installe et build tout seul.

---

## Mettre en ligne ce soir (GitHub → Vercel)

1. **GitHub** — crée un repo vide (ex. `clipwar-war-room`).
2. Dans le repo, bouton **Add file → Upload files**, puis **glisse le dossier**
   (Chrome conserve l'arborescence). Commit.
3. **Vercel** — `vercel.com` → **Add New → Project** → importe le repo.
   Aucune variable d'environnement requise à ce stade. **Deploy**.
4. ~1 min plus tard, l'URL `*.vercel.app` est en ligne.

> Si tu utilises ton compte habituel, garde l'email de commit `keyansaas@gmail.com`.

Pour tester en local (optionnel) : `npm install` puis `npm run dev` → http://localhost:3000

---

## Phase 2 — brancher le réel (rien à jeter)

Tout est en place pour que les écrans ne changent pas. Il restera à :

1. **Supabase** — schéma (campagnes, assets, clips, snapshots, paiements, rôles) +
   remplacer `lib/data.ts` par des appels serveur.
2. **ScrapeCreators** — clé en variable d'environnement Vercel (jamais dans le code) +
   route serveur `cron` qui relève les vues de chaque clip plusieurs fois/jour →
   table `view_snapshots`.
3. **Cloudflare R2** — stockage des assets (egress gratuit) ; l'app garde la fiche.
4. **Moteur de paiement** — calcul des vues nettes sur fenêtre 7 j glissants +
   logique de *hold* / anti-triche côté serveur.
