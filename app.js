import { newCard, levelText, dueText, parse, review, shuffle, planImport, takeProgress, pack, unpack, today, MAX_LINK } from './cards.js';

const $ = s => document.querySelector(s);
const state = JSON.parse(localStorage.flashy || '{"cards":[]}');
const save = () => localStorage.flashy = JSON.stringify(state);

// Tabs
function show(tab) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('section').forEach(s => s.hidden = s.id !== tab);
  if (tab === 'train') startSession();
  if (tab === 'deck') renderDeck();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.tab));
$('h1').onclick = () => show('train'); // keyboard users have the train tab

// Add
const fields = tr => [...tr.querySelectorAll('textarea')].map(t => t.value.replace(/\s+/g, ' ').trim()); // a stray Enter isn't part of the card

function row(front, back) {
  const tr = document.createElement('tr');
  tr.innerHTML = '<td><textarea rows="2"></textarea><small class="n"></small><td><textarea rows="2"></textarea><td><button title="Remove">×</button>';
  const [f, b] = tr.querySelectorAll('textarea');
  f.value = front; b.value = back;
  tr.querySelector('button').onclick = () => { tr.remove(); checkRows(); };
  return tr;
}

const setName = () => $('#set-name').value.replace(/\s+/g, ' ').trim();
const rowCards = () => [...$('#rows').rows].map(fields).filter(([f, b]) => f && b).map(([f, b]) => newCard(f, b, setName()));

// Flags rows whose front is already in the deck or repeats an earlier row,
// offers "add without duplicates" only when there are some, and readies the link to just these cards.
function checkRows() {
  const inDeck = new Set(state.cards.map(c => c.front)), seen = new Set();
  let dups = 0;
  for (const tr of $('#rows').rows) {
    const [front] = fields(tr);
    const note = !front ? '' : inDeck.has(front) ? 'already in deck' : seen.has(front) ? 'repeated above' : '';
    seen.add(front);
    tr.classList.toggle('dup', !!note);
    tr.querySelector('small').textContent = note;
    if (note) dups++;
  }
  const rows = $('#rows').rows.length;
  $('#confirm').hidden = !rows;
  $('#add-btn').textContent = dups ? `add all ${rows}` : 'add to deck';
  $('#add-new').textContent = `add ${rows - dups} without duplicates`;
  $('#add-new').hidden = !dups;
  $('#set-msg').textContent = '';
  $('#set-link').hidden = true;
}
$('#rows').oninput = $('#set-name').oninput = checkRows;
$('#share-set').onclick = () => copyLink(rowCards(), $('#set-link'), $('#set-msg'));

$('#detect').onclick = () => {
  $('#rows').replaceChildren(...parse($('#paste').value).map(p => row(...p)));
  checkRows();
  $('#add-msg').textContent = '';
};

function addRows(skipDuplicates) {
  const have = new Set(state.cards.map(c => c.front));
  let added = 0, skipped = 0;
  for (const tr of [...$('#rows').rows]) {
    const [front, back] = fields(tr);
    if (!front || !back) continue; // leave incomplete rows for fixing
    if (skipDuplicates && have.has(front)) skipped++;
    else { have.add(front); state.cards.push(newCard(front, back, setName())); added++; }
    tr.remove();
  }
  save();
  checkRows();
  const left = $('#rows').rows.length;
  if (!left) $('#paste').value = $('#set-name').value = '';
  $('#add-msg').textContent = `Added ${added}.` + (skipped ? ` Skipped ${skipped} duplicates.` : '') + (left ? ' Fill in both sides of the rows left.' : '');
  if (added && !left) { $('#add-msg').textContent = ''; show('train'); } // stay only if something needs fixing
}
$('#add-btn').onclick = () => addRows(false);
$('#add-new').onclick = () => addRows(true);

// Train
let queue = [], cur = null, flipped = false, answered = []; // answered: {card, before} for each answer, newest last

// "due today" trains only cards due today or overdue; "all cards" runs the whole deck.
const allMode = () => state.mode === 'all';
function setMode(mode) { state.mode = mode; save(); startSession(); }
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

let resume = new URLSearchParams(location.search).get('card'); // the card on screen before a reload

function startSession() {
  queue = shuffle(state.cards.filter(c => allMode() || c.due <= today()));
  const i = queue.findIndex(c => c.front === resume);
  if (i > 0) queue.unshift(...queue.splice(i, 1));
  resume = null;
  answered = [];
  next();
}

function next() { cur = queue.shift(); flipped = false; render(); }

function render() {
  // Keep the current card in the URL so a reload comes back to it. The hash is left alone: it may hold a share link.
  history.replaceState(null, '', (cur ? '?card=' + encodeURIComponent(cur.front) : location.pathname) + location.hash);
  $('#reverse').checked = !!state.reverse;
  $('#trainer').hidden = !cur;
  $('#done').hidden = !!cur;
  $('#train-top').hidden = $('#train-note').hidden = !state.cards.length; // nothing to flip or explain yet
  const day = today(), total = state.cards.length;
  const learned = state.cards.filter(c => c.level && c.due > day).length;
  const due = state.cards.filter(c => c.due <= day).length;
  $('#stats').textContent = `${learned} of ${total} learned · ${due} due today · ${cur ? queue.length + 1 : 0} left`;
  $('#bar i').style.width = `${total && 100 * learned / total}%`;
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === (allMode() ? 'all' : 'due')));
  $('#left').textContent = cur ? levelText(cur) : '';
  if (!cur) {
    const soonest = Math.min(...state.cards.map(c => c.due)) - today();
    $('#done-msg').textContent = !state.cards.length ? 'No cards yet.'
      : soonest > 0 ? `Nothing due. Next cards in ${soonest} day${soonest > 1 ? 's' : ''}.` : 'Done for now.';
    $('#all').hidden = !state.cards.length || allMode();
    $('#go-add').hidden = !!state.cards.length;
    return;
  }
  const [q, a] = state.reverse ? [cur.back, cur.front] : [cur.front, cur.back];
  $('#set').textContent = cur.set || '';
  $('#set').hidden = !cur.set;
  $('#q').textContent = q;
  $('#a').textContent = flipped ? a : '';
  $('#flip').hidden = flipped;
  $('#grade').hidden = !flipped;
}

function flip() { if (cur) { flipped = !flipped; render(); } }

function grade(ok) {
  if (!cur || !flipped) return;
  answered.push({ card: cur, before: { ...cur } });
  review(cur, ok);
  if (!ok) queue.push(cur); // back at the end of this session
  save(); next();
}

// Back takes the last answer back: the card gets its old level and counts, and shows again, flipped.
function back() {
  const last = answered.pop();
  if (!last) return;
  Object.assign(last.card, last.before);
  const requeued = queue.indexOf(last.card); // "again" had put it back in the queue
  if (requeued !== -1) queue.splice(requeued, 1);
  if (cur && cur !== last.card) queue.unshift(cur);
  cur = last.card;
  flipped = true;
  save(); render();
}

// Skip moves an unflipped card to the end of the session. Once you've seen the answer,
// moving on without "got it" counts as "again".
function skip() {
  if (flipped) return grade(false);
  if (cur && queue.length) { queue.push(cur); next(); }
}

$('#card').onclick = $('#flip').onclick = flip;
$('#again').onclick = () => grade(false);
$('#got').onclick = () => grade(true);
$('#all').onclick = () => setMode('all');
$('#go-add').onclick = () => show('add');
$('#reverse').onchange = e => { state.reverse = e.target.checked; save(); render(); };

document.onkeydown = e => {
  if ($('#train').hidden || e.target.matches('textarea, input:not([type=checkbox])')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); skip(); }
  if (e.key === ' ' || e.key === 'Enter') { if (!cur) return; e.preventDefault(); flip(); }
  if (e.key === '1') grade(false);
  if (e.key === '2') grade(true);
};

// Deck. Ticked cards are what the share link carries; none ticked means the whole deck.
const picked = new Set();

function renderDeck() {
  $('#count').textContent = `${state.cards.length} cards · each right answer moves a card up a level and shows it less often`;
  $('#list').replaceChildren(...state.cards.map(c => {
    const tr = document.createElement('tr');
    const pick = tr.insertCell();
    pick.className = 'pick';
    const box = pick.appendChild(document.createElement('input'));
    box.type = 'checkbox';
    box.title = 'Select for sharing';
    box.checked = picked.has(c);
    box.onchange = () => { box.checked ? picked.add(c) : picked.delete(c); updateShare(); };
    for (const t of [c.front, c.back]) tr.insertCell().textContent = t;
    const stats = tr.insertCell();
    stats.className = 'n';
    stats.append(`${c.set ? c.set + ' · ' : ''}${levelText(c)} · ${dueText(c)}`);
    if (c.right || c.wrong) stats.append(document.createElement('br'), `${c.right} right, ${c.wrong} wrong`);
    const del = tr.insertCell().appendChild(document.createElement('button'));
    del.textContent = '×';
    del.title = 'Delete';
    del.onclick = () => { state.cards.splice(state.cards.indexOf(c), 1); picked.delete(c); save(); renderDeck(); };
    return tr;
  }));
  updateShare();
}

// Ticked cards, or the whole deck. Without "include my progress" they go out as new cards.
const shareCards = () => {
  const some = state.cards.filter(c => picked.has(c));
  const cards = some.length ? some : state.cards;
  return $('#with-progress').checked ? cards : cards.map(c => newCard(c.front, c.back, c.set));
};
$('#with-progress').onchange = updateShare; // clears a link made with the other setting

function updateShare() {
  const some = state.cards.filter(c => picked.has(c)).length;
  $('#share').textContent = some ? `copy link to ${some} selected` : `copy link to all ${state.cards.length} cards`;
  $('#unselect').hidden = !some;
  $('#link').hidden = true;
  $('#share-msg').textContent = '';
}

$('#unselect').onclick = () => { picked.clear(); renderDeck(); };

// Drag across the checkboxes to tick or untick a run of cards; the first box decides which.
// Rows the pointer skips over between two move events are filled in too.
let dragTo = null, dragLast = -1, dragged = false;
const tick = box => { if (box.checked !== dragTo) { box.checked = dragTo; box.onchange(); } };
$('#list').onpointerdown = e => {
  const box = e.target.closest('td.pick')?.querySelector('input');
  if (box) { dragTo = !box.checked; dragLast = box.closest('tr').sectionRowIndex; dragged = false; }
};
document.onpointermove = e => {
  if (dragTo === null) return;
  const i = document.elementFromPoint(e.clientX, e.clientY)?.closest('#list tr')?.sectionRowIndex;
  if (i === undefined || i === dragLast) return;
  if (!dragged) { dragged = true; document.body.classList.add('dragging'); }
  const boxes = document.querySelectorAll('#list .pick input');
  for (let j = Math.min(i, dragLast); j <= Math.max(i, dragLast); j++) tick(boxes[j]);
  dragLast = i;
};
document.onpointerup = document.onpointercancel = () => { dragTo = null; document.body.classList.remove('dragging'); };
// A drag that ends back on its first box would otherwise toggle that box once more.
$('#list').addEventListener('click', e => { if (dragged && e.target.matches('input')) e.preventDefault(); dragged = false; }, true);

$('#reset').onclick = () => {
  if (!confirm('Reset progress for all cards?')) return;
  state.cards = state.cards.map(c => newCard(c.front, c.back, c.set)); save(); renderDeck();
};
$('#clear').onclick = () => {
  if (!confirm('Delete all cards?')) return;
  state.cards = []; picked.clear(); save(); renderDeck();
};

// Short links: the deck goes to the server, the link carries only its id. If the server can't be
// reached (offline, or no functions running), the deck goes into the link itself as before.
// Links leave out ?card: that's only where you are in your own session.
const base = () => location.origin + location.pathname;

async function shortLink(code) {
  try {
    const res = await fetch('/api/decks', { method: 'POST', body: code });
    if (res.ok) return base() + '#s=' + (await res.json()).id;
  } catch {}
  return base() + '#' + code;
}

function copyLink(cards, field, msg) {
  msg.textContent = 'Making a link…';
  const link = pack(cards).then(shortLink);
  // Safari only lets a click write to the clipboard if the write starts right away, so it gets the link as a promise.
  const copied = typeof ClipboardItem === 'function'
    ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': link.then(l => new Blob([l], { type: 'text/plain' })) })])
    : link.then(l => navigator.clipboard.writeText(l));
  link.then(l => {
    field.value = l;
    field.hidden = false;
    field.select();
    const tooLong = l.length > MAX_LINK;
    copied.then(
      () => msg.textContent = tooLong ? 'Copied. Too long to open as a link: paste it into the import field instead.' : 'Copied.',
      () => msg.textContent = 'Copy the link below.');
  });
}

$('#share').onclick = () => copyLink(shareCards(), $('#link'), $('#share-msg'));

// `ref` is what follows the # in a share link: "s=<id>" for a short link, or the deck itself.
async function importDeck(ref) {
  let cards;
  try {
    const res = ref.startsWith('s=') && await fetch('/api/decks/' + encodeURIComponent(ref.slice(2)));
    if (res && !res.ok) throw new Error(res.status);
    cards = await unpack(res ? await res.text() : ref);
  }
  catch { return alert("Couldn't read that link."); }
  const { added, updated, kept } = planImport(state.cards, cards);
  const count = (n, what) => `${n} ${what}${n === 1 ? '' : 's'}`;
  const newer = kept ? ` ${count(kept, 'card')} keep${kept === 1 ? 's' : ''} your progress, which is newer.` : '';
  if (!added.length && !updated.length)
    return alert(`You already have all ${cards.length} cards from this link` + (cards.some(c => c.right || c.wrong) ? (newer ? '.' + newer : ', with the same progress.') : '.'));
  const sets = [...new Set(added.map(c => c.set).filter(Boolean))];
  const steps = [
    added.length && `add ${count(added.length, 'new card')}` + (sets.length ? ` from “${sets.join('”, “')}”` : ''),
    updated.length && `update progress on ${count(updated.length, 'card')} you already have`,
  ].filter(Boolean).join(' and ');
  if (!confirm(steps[0].toUpperCase() + steps.slice(1) + '?' + (updated.length ? " On those, the link's progress replaces yours." : '') + newer)) return;
  state.cards.push(...added);
  updated.forEach(([mine, from]) => takeProgress(mine, from));
  save(); show('train');
}

$('#import').onclick = () => importDeck($('#import-in').value.split('#').pop());

function importFromHash() {
  if (location.hash.length < 2) return;
  const code = location.hash.slice(1);
  history.replaceState(null, '', location.pathname + location.search); // don't re-import on reload
  importDeck(code);
}

window.onhashchange = importFromHash; // link pasted into a tab that already has the page open
show('train');
importFromHash();
