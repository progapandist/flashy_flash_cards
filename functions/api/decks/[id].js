// GET /api/decks/:id → the share code stored under a short link.
export async function onRequestGet({ params, env }) {
  const code = /^[\w-]{12}$/.test(params.id) && await env.DECKS.get(params.id);
  if (!code) return new Response('not found', { status: 404 });
  // An id is a hash of its deck, so what's behind it never changes.
  return new Response(code, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } });
}
