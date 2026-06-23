// ─────────────────────────────────────────────────────────────
//  ClipWar — couche de données (MAQUETTE)
//  Phase 2 : ce fichier sera remplacé par des appels Supabase /
//  tRPC côté serveur. La forme des objets ci-dessous est déjà la
//  forme cible, donc les écrans n'auront pas à changer.
// ─────────────────────────────────────────────────────────────

export type Campaign = {
  id: string; name: string; grad: string; tag: "" | "cy" | "co";
  rate: number; assets: number; desc: string;
};
export type Asset = {
  id: number; t: string; camp: string; dur: string;
  dl: number; clips: number; vues: number;
};
export type ClipStatus = "track" | "paid" | "hold";
export type MyClip = {
  id: string; asset: string; plat: string;
  vues: number; d7: number; st: ClipStatus;
  url?: string; ago?: number;
  rate?: number; paid?: number; due?: number; gain?: number;
};
export type Challenge = { t: string; sub: string; prog: number; reward: string; c: "" | "c2" };
export type Clipper = { n: string; rk: string; vues: number; gain: number; clips: number };
export type Alert = { ic: string; t: string; s: string };

export const fmt = (n: number) =>
  n.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
export const euro = (n: number) => fmt(Math.round(n)) + " €";

export const campaigns: Campaign[] = [
  { id: "life", name: "Lifestyle", grad: "linear-gradient(135deg,#2DE2E6,#8B6CFF)", tag: "cy", rate: 1.0, assets: 14, desc: "Quotidien, voyages, behind-the-scenes" },
  { id: "coach", name: "Coaching", grad: "linear-gradient(135deg,#8B6CFF,#AB8DFF)", tag: "", rate: 1.2, assets: 9, desc: "Mindset, méthode, motivation" },
  { id: "biz", name: "Le Business Paie", grad: "linear-gradient(135deg,#FF6A45,#FFB23E)", tag: "co", rate: 1.5, assets: 21, desc: "Argent, entreprise, finance" },
];

export const assets: Asset[] = [
  { id: 1, t: "Routine matinale 5h", camp: "life", dur: "2:14", dl: 312, clips: 41, vues: 1284000 },
  { id: 2, t: "Pourquoi 99% échouent", camp: "biz", dur: "0:58", dl: 540, clips: 88, vues: 3920000 },
  { id: 3, t: "Mindset du closing", camp: "coach", dur: "1:32", dl: 201, clips: 27, vues: 642000 },
  { id: 4, t: "1 an pour 100k€", camp: "biz", dur: "3:05", dl: 430, clips: 63, vues: 2180000 },
  { id: 5, t: "Sortie Dubaï vlog", camp: "life", dur: "1:47", dl: 178, clips: 22, vues: 498000 },
  { id: 6, t: "La règle des 3 piliers", camp: "coach", dur: "2:40", dl: 96, clips: 11, vues: 152000 },
];

export const initialClips: MyClip[] = [
  { id: "c1", asset: "Pourquoi 99% échouent", plat: "TikTok", vues: 184320, d7: 42100, st: "track" },
  { id: "c2", asset: "1 an pour 100k€", plat: "Instagram", vues: 97650, d7: 18400, st: "track" },
  { id: "c3", asset: "Routine matinale 5h", plat: "YouTube", vues: 54210, d7: 6200, st: "paid" },
  { id: "c4", asset: "Mindset du closing", plat: "TikTok", vues: 312880, d7: -1500, st: "hold" },
  { id: "c5", asset: "(contenu original)", plat: "TikTok", vues: 8940, d7: 8940, st: "track" },
];

export const challenges: Challenge[] = [
  { t: "Sprint Lifestyle 48h", sub: "Fini dans 22 h", prog: 64, reward: "Cagnotte 400 €", c: "" },
  { t: "Business · 1M vues", sub: "Objectif collectif", prog: 78, reward: "780 k / 1 M vues", c: "c2" },
];

export const clippers: Clipper[] = [
  { n: "Léa M.", rk: "Sergent", vues: 312000, gain: 248, clips: 9 },
  { n: "Theo R.", rk: "Capitaine", vues: 1240000, gain: 980, clips: 24 },
  { n: "Sofia B.", rk: "Sergent", vues: 288000, gain: 214, clips: 7 },
  { n: "Nael K.", rk: "Recrue", vues: 64000, gain: 51, clips: 3 },
];

export const alerts: Alert[] = [
  { ic: "!", t: "Progression négative — Clip #c4", s: "-1 500 vues sur 24 h. Possible purge de bot. Paiement gelé." },
  { ic: "⧉", t: "Doublon suspecté", s: "2 liens TikTok quasi identiques soumis par Nael K." },
  { ic: "∅", t: "Clip supprimé après bilan", s: "Un clip payé n'est plus accessible. À revoir." },
];

export const campName = (id: string) => campaigns.find((c) => c.id === id)?.name ?? "";
export const campGrad = (id: string) => campaigns.find((c) => c.id === id)?.grad ?? "var(--grad)";
export const initials = (s: string) => s.split(" ").map((w) => w[0]).join("").slice(0, 2);

// ─────────── DONNÉES ADMIN (maquette) ───────────
export type ClipperRow = {
  id: string; name: string; rank: string; country: string; minor: boolean;
  tiktok?: string; instagram?: string; youtube?: string; payout: string; payoutDetail: string;
  vues7: number; vuesTotal: number; clips: number; gain: number; pubs7: number[];
  recent: { asset: string; plat: string; vues: number; d7: number; st: ClipStatus }[];
};

export const clippersFull: ClipperRow[] = [
  { id: "cl1", name: "Theo R.", rank: "Capitaine", country: "France", minor: false,
    tiktok: "@theoclips", instagram: "@theo.r", youtube: "TheoClips", payout: "PayPal", payoutDetail: "theo@mail.com",
    vues7: 1240000, vuesTotal: 8900000, clips: 24, gain: 980, pubs7: [3, 2, 4, 3, 5, 2, 3],
    recent: [
      { asset: "Pourquoi 99% échouent", plat: "TikTok", vues: 412000, d7: 88000, st: "track" },
      { asset: "1 an pour 100k€", plat: "YouTube", vues: 208000, d7: 24000, st: "track" },
      { asset: "Mindset du closing", plat: "Instagram", vues: 96000, d7: -2000, st: "hold" },
    ] },
  { id: "cl2", name: "Léa M.", rank: "Sergent", country: "Belgique", minor: false,
    tiktok: "@leaclips", instagram: "@lea.m", payout: "PayPal", payoutDetail: "lea@mail.com",
    vues7: 312000, vuesTotal: 1480000, clips: 9, gain: 248, pubs7: [1, 2, 1, 2, 1, 1, 2],
    recent: [
      { asset: "Routine matinale 5h", plat: "TikTok", vues: 184000, d7: 42000, st: "track" },
      { asset: "Sortie Dubaï vlog", plat: "Instagram", vues: 64000, d7: 9000, st: "track" },
    ] },
  { id: "cl3", name: "Sofia B.", rank: "Sergent", country: "France", minor: true,
    tiktok: "@sofiab", payout: "IBAN", payoutDetail: "FR76 ...",
    vues7: 288000, vuesTotal: 990000, clips: 7, gain: 214, pubs7: [2, 1, 2, 2, 1, 0, 1],
    recent: [{ asset: "La règle des 3 piliers", plat: "TikTok", vues: 142000, d7: 31000, st: "track" }] },
  { id: "cl4", name: "Inès D.", rank: "Lieutenant", country: "Suisse", minor: false,
    tiktok: "@inesd", instagram: "@ines.d", youtube: "InesClips", payout: "PayPal", payoutDetail: "ines@mail.com",
    vues7: 540000, vuesTotal: 3200000, clips: 15, gain: 432, pubs7: [2, 3, 2, 4, 3, 2, 3],
    recent: [{ asset: "1 an pour 100k€", plat: "TikTok", vues: 260000, d7: 54000, st: "track" }] },
  { id: "cl5", name: "Nael K.", rank: "Recrue", country: "Maroc", minor: false,
    tiktok: "@naelk", youtube: "NaelK", payout: "PayPal", payoutDetail: "nael@mail.com",
    vues7: 64000, vuesTotal: 120000, clips: 3, gain: 51, pubs7: [1, 0, 1, 1, 0, 1, 0],
    recent: [{ asset: "(contenu original)", plat: "TikTok", vues: 38000, d7: 12000, st: "track" }] },
  { id: "cl6", name: "Marco T.", rank: "Recrue", country: "France", minor: false,
    tiktok: "@marcot", payout: "Autre", payoutDetail: "—",
    vues7: 42000, vuesTotal: 78000, clips: 2, gain: 33, pubs7: [0, 1, 0, 1, 0, 0, 1],
    recent: [{ asset: "Routine matinale 5h", plat: "Instagram", vues: 24000, d7: 7000, st: "track" }] },
];

export const views7days = [820000, 940000, 760000, 1120000, 1340000, 980000, 1450000];
export const dayLabels = ["L", "M", "M", "J", "V", "S", "D"];
export const aVerserTotal = clippersFull.reduce((s, c) => s + c.gain, 0);

// ─────────── CLIPS DÉTAILLÉS (maquette) ───────────
export type AdminClip = {
  id: string; clipperId: string; clipperName: string; asset: string; campaign: string;
  platform: "tiktok" | "instagram" | "youtube"; url: string;
  vues: number; d7: number; st: ClipStatus; postedDaysAgo: number;
};

export const adminClips: AdminClip[] = [
  { id: "k4", clipperId: "cl2", clipperName: "Léa M.", asset: "Routine matinale 5h", campaign: "life", platform: "tiktok", url: "https://www.tiktok.com/@leaclips/video/7546905555512340", vues: 184000, d7: 42000, st: "track", postedDaysAgo: 0 },
  { id: "k9", clipperId: "cl5", clipperName: "Nael K.", asset: "(contenu original)", campaign: "life", platform: "tiktok", url: "https://www.tiktok.com/@naelk/video/7546903333312340", vues: 38000, d7: 12000, st: "track", postedDaysAgo: 0 },
  { id: "k3", clipperId: "cl1", clipperName: "Theo R.", asset: "Mindset du closing", campaign: "coach", platform: "instagram", url: "https://www.instagram.com/reel/C9xKvtABcDe/", vues: 96000, d7: -2000, st: "hold", postedDaysAgo: 1 },
  { id: "k6", clipperId: "cl3", clipperName: "Sofia B.", asset: "La règle des 3 piliers", campaign: "coach", platform: "tiktok", url: "https://www.tiktok.com/@sofiab/video/7546908888812340", vues: 142000, d7: 31000, st: "track", postedDaysAgo: 1 },
  { id: "k12", clipperId: "cl4", clipperName: "Inès D.", asset: "Mindset du closing", campaign: "coach", platform: "tiktok", url: "https://www.tiktok.com/@inesd/video/7546907777712340", vues: 54000, d7: -800, st: "hold", postedDaysAgo: 1 },
  { id: "k1", clipperId: "cl1", clipperName: "Theo R.", asset: "Pourquoi 99% échouent", campaign: "biz", platform: "tiktok", url: "https://www.tiktok.com/@theoclips/video/7546901234567890", vues: 412000, d7: 88000, st: "track", postedDaysAgo: 2 },
  { id: "k7", clipperId: "cl4", clipperName: "Inès D.", asset: "1 an pour 100k€", campaign: "biz", platform: "tiktok", url: "https://www.tiktok.com/@inesd/video/7546901111122340", vues: 260000, d7: 54000, st: "track", postedDaysAgo: 2 },
  { id: "k5", clipperId: "cl2", clipperName: "Léa M.", asset: "Sortie Dubaï vlog", campaign: "life", platform: "instagram", url: "https://www.instagram.com/reel/C9zLeaDubai/", vues: 64000, d7: 9000, st: "track", postedDaysAgo: 3 },
  { id: "k14", clipperId: "cl3", clipperName: "Sofia B.", asset: "Sortie Dubaï vlog", campaign: "life", platform: "instagram", url: "https://www.instagram.com/reel/C9SofiaDub/", vues: 76000, d7: 11000, st: "track", postedDaysAgo: 3 },
  { id: "k8", clipperId: "cl4", clipperName: "Inès D.", asset: "Routine matinale 5h", campaign: "life", platform: "youtube", url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", vues: 120000, d7: 18000, st: "track", postedDaysAgo: 4 },
  { id: "k2", clipperId: "cl1", clipperName: "Theo R.", asset: "1 an pour 100k€", campaign: "biz", platform: "youtube", url: "https://www.youtube.com/shorts/aV5Svd6Y4Zc", vues: 208000, d7: 24000, st: "track", postedDaysAgo: 5 },
  { id: "k15", clipperId: "cl5", clipperName: "Nael K.", asset: "1 an pour 100k€", campaign: "biz", platform: "youtube", url: "https://www.youtube.com/shorts/L_jWHffIx5E", vues: 22000, d7: 3000, st: "track", postedDaysAgo: 5 },
  { id: "k10", clipperId: "cl6", clipperName: "Marco T.", asset: "Routine matinale 5h", campaign: "life", platform: "instagram", url: "https://www.instagram.com/reel/C9MarcoRt/", vues: 24000, d7: 7000, st: "track", postedDaysAgo: 6 },
  { id: "k11", clipperId: "cl1", clipperName: "Theo R.", asset: "Pourquoi 99% échouent", campaign: "biz", platform: "instagram", url: "https://www.instagram.com/reel/C9TheoBiz/", vues: 88000, d7: 15000, st: "track", postedDaysAgo: 7 },
  { id: "k13", clipperId: "cl2", clipperName: "Léa M.", asset: "La règle des 3 piliers", campaign: "coach", platform: "youtube", url: "https://www.youtube.com/shorts/3JZ_D3ELwOQ", vues: 31000, d7: 4000, st: "paid", postedDaysAgo: 9 },
];

export const agoLabel = (d: number) => (d === 0 ? "aujourd'hui" : d === 1 ? "hier" : `il y a ${d} j`);
export const platLabel: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };
