// Deck logic with no DOM: parsing, scheduling, sharing. app.js wires it to the page.

export const INTERVALS = [0, 1, 2, 4, 8, 16, 32]; // days until a card comes back, per level 0–6

// Local day number, so a card due "tomorrow" is due after midnight, not after 24 hours.
export const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);

// `set` names the topic a card came with, e.g. a teacher's shared set. Empty for your own cards.
export const newCard = (front, back, set = '') => ({ front, back, set, level: 0, due: 0, right: 0, wrong: 0 });

export const levelText = c => c.right || c.wrong ? `level ${c.level} of 6` : 'new';

export const dueText = (c, day = today()) => {
  const days = c.due - day;
  return days > 0 ? `next in ${days} day${days > 1 ? 's' : ''}` : 'due today';
};

// One pair per line, foreign side first. The first separator found in a line wins,
// so ";" inside a translation survives and "E-Mail" isn't split.
export function parse(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const sep = ['—', '–', '|', ' - ', ';'].find(s => line.includes(s));
    if (!sep) return [line, ''];
    const i = line.indexOf(sep);
    return [line.slice(0, i).trim(), line.slice(i + sep.length).trim()];
  });
}

// Leitner step. "Again" sends a card back to level 0, due today.
// Cards practiced before they're due count the answer but don't move up.
export function review(card, ok, day = today()) {
  if (!ok) { card.wrong++; card.level = 0; card.due = day; return; }
  card.right++;
  if (card.due > day) return;
  card.level = Math.min(card.level + 1, 6);
  card.due = day + INTERVALS[card.level];
}

export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Cards from `incoming` whose front isn't in `deck` yet, without duplicates among themselves.
export function newOnly(deck, incoming) {
  const have = new Set(deck.map(c => c.front));
  return incoming.filter(c => !have.has(c.front) && have.add(c.front));
}

// Longest link we let open directly. Chromium stops at 2 MB; Firefox's cap is 1 MB.
// Longer links still work pasted into the import field.
export const MAX_LINK = 1_000_000;

// Share codes: deflate-raw, then base64url so the code survives in a URL hash.
// The deck goes in as columns (fronts, backs, numbers, set names) rather than one object per card,
// and due dates count from the day of packing, so most of them are small numbers.
export async function pack(cards, day = today()) {
  return encode(JSON.stringify([day, cards.map(c => c.front), cards.map(c => c.back),
    cards.flatMap(c => [c.level, c.due && c.due - day, c.right, c.wrong]), cards.map(c => c.set || '')]));
}

// Shared data is untrusted: keep only well-formed cards with sane numbers. Throws on garbage.
export async function unpack(code) {
  const [day, fronts, backs, nums, sets = []] = JSON.parse(await decode(code));
  return fronts.flatMap((front, i) => {
    const [level, due, right, wrong] = nums.slice(i * 4, i * 4 + 4);
    return front && backs[i] ? [{
      front: String(front), back: String(backs[i]), set: sets[i] ? String(sets[i]) : '', level: Math.min(Math.max(level | 0, 0), 6),
      due: due ? (day + due) | 0 : 0, right: Math.max(right | 0, 0), wrong: Math.max(wrong | 0, 0),
    }] : [];
  });
}

export async function encode(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decode(code) {
  const bytes = Uint8Array.from(atob(code.trim().replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}
