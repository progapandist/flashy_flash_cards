// POST /api/decks with a share code as the body → { id } for a short link.
import { unpack } from '../../../cards.js';

const MAX_CODE = 1_000_000; // about 20,000 cards

export async function onRequestPost({ request, env }) {
  const code = await request.text();
  if (code.length > MAX_CODE) return new Response('deck too large', { status: 413 });
  try { if (!(await unpack(code)).length) throw new Error('empty'); }
  catch { return new Response('not a deck', { status: 400 }); }

  // The id comes from the deck's own hash: sharing the same cards twice gives the same link and no second write.
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  const id = btoa(String.fromCharCode(...hash.slice(0, 9))).replace(/\+/g, '-').replace(/\//g, '_');
  if (await env.DECKS.get(id) === null) await env.DECKS.put(id, code);
  return Response.json({ id });
}
