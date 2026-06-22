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
