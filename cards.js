// Deck logic with no DOM: parsing, scheduling, sharing. app.js wires it to the page.

export const INTERVALS = [0, 1, 2, 4, 8, 16, 32]; // days until a card comes back, per level 0–6

// Local day number, so a card due "tomorrow" is due after midnight, not after 24 hours.
export const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);

// `set` names the topic a card came with, e.g. a teacher's shared set. Empty for your own cards.
// `seen` is when the card was last answered, in Unix seconds; 0 if never (or answered before this was kept).
export const newCard = (front, back, set = '') => ({ front, back, set, level: 0, due: 0, right: 0, wrong: 0, seen: 0 });

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
export function review(card, ok, day = today(), now = Math.floor(Date.now() / 1000)) {
  card.seen = now;
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

// What importing `incoming` into `deck` would do, without changing either:
// `added` are cards with fronts you don't have yet (repeats within the link count once);
// `updated` pairs one of your cards with a linked copy whose progress differs and is at least as recent;
// `kept` pairs the same way where your progress is newer than the link's. Only linked cards answered at least
// once count, so a progress-free link never resets yours. Without times on either side, the link wins.
const PROGRESS = ['level', 'due', 'right', 'wrong', 'seen'];
export function planImport(deck, incoming) {
  const yours = new Set(deck), have = new Map(deck.map(c => [c.front, c])), added = [], updated = [], kept = [];
  for (const c of incoming) {
    const mine = have.get(c.front);
    if (!mine) { have.set(c.front, c); added.push(c); continue; }
    if (!yours.has(mine) || !(c.right || c.wrong) || PROGRESS.every(k => (mine[k] || 0) === (c[k] || 0))) continue;
    if ((c.seen || 0) >= (mine.seen || 0)) updated.push([mine, c]);
    else kept.push([mine, c]);
  }
  return { added, updated, kept };
}

export const takeProgress = (mine, from) => PROGRESS.forEach(k => mine[k] = from[k]);

// Share codes: deflate-raw, then base64url so the code survives in a URL hash.
// The deck goes in as columns (fronts, backs, numbers, set names, answer times) rather than one object per card,
// and due dates count from the day of packing, so most of them are small numbers.
export async function pack(cards, day = today()) {
  return encode(JSON.stringify([day, cards.map(c => c.front), cards.map(c => c.back),
    cards.flatMap(c => [c.level, c.due && c.due - day, c.right, c.wrong]), cards.map(c => c.set || ''), cards.map(c => c.seen || 0)]));
}

// Shared data is untrusted: keep only well-formed cards with sane numbers. Throws on garbage.
export async function unpack(code) {
  const [day, fronts, backs, nums, sets = [], seens = []] = JSON.parse(await decode(code));
  return fronts.flatMap((front, i) => {
    const [level, due, right, wrong] = nums.slice(i * 4, i * 4 + 4);
    return front && backs[i] ? [{
      front: String(front), back: String(backs[i]), set: sets[i] ? String(sets[i]) : '', level: Math.min(Math.max(level | 0, 0), 6),
      due: due ? (day + due) | 0 : 0, right: Math.max(right | 0, 0), wrong: Math.max(wrong | 0, 0),
      seen: Math.max(Math.floor(Number(seens[i])) || 0, 0),
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
