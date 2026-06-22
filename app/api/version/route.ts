export const dynamic = "force-dynamic";
export const revalidate = 0;

// Renvoie un identifiant unique par déploiement Vercel.
// Le client compare cette valeur pour détecter une nouvelle version.
export async function GET() {
  const v =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev";
  return new Response(JSON.stringify({ v }), {
    headers: { "content-type": "application/json", "cache-control": "no-store, max-age=0" },
  });
}
