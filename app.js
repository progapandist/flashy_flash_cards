import { newCard, levelText, dueText, parse, review, shuffle, planImport, takeProgress, pack, unpack, today } from './cards.js';

const $ = s => document.querySelector(s);
const state = JSON.parse(localStorage.flashy || '{"cards":[]}');
const save = () => localStorage.flashy = JSON.stringify(state);

// One in-app dialog for every question and notice. `buttons` are [label, value, class]; resolves with
// the chosen value, or null after Esc, a backdrop click or a button whose value is null.
function ask(title, lines, buttons = [['OK', true, 'primary']]) {
  const dialog = $('#ask');
  $('#ask-title').textContent = title;
  $('#ask-text').replaceChildren(...[lines].flat().filter(Boolean).map(t => Object.assign(document.createElement('p'), { textContent: t })));
  $('#ask-buttons').replaceChildren(...buttons.map(([label, , cls = ''], i) => {
    const b = Object.assign(document.createElement('button'), { textContent: label, className: cls });
    b.onclick = () => dialog.close(String(i));
    return b;
  }));
  dialog.onclick = e => { if (e.target === dialog) dialog.close(); };
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => dialog.onclose = () => resolve(buttons[dialog.returnValue]?.[1] ?? null));
}

// Tabs
function show(tab) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('section').forEach(s => s.hidden = s.id !== tab);
  if (tab === 'train') startSession();
  if (tab === 'deck') renderDeck();
  // One share block, moved into the open tab, so Train and Deck can't drift apart.
  const slot = $(`#${tab} .share-slot`);
  if (slot) { slot.append($('#share-block')); updateShare(); }
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
  $('#set-link').hidden = true;
}
$('#rows').oninput = $('#set-name').oninput = checkRows;
$('#share-set').onclick = e => copyLink(rowCards(), $('#set-link'), e.currentTarget);

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
let queue = [], cur = null, flipped = false;

// Every answer and skip, newest last, so ← can step back. It outlives tab switches and, per browser tab,
// reloads (sessionStorage), so ← keeps working after the page reloads onto the same card.
let answered = (() => {
  try {
    return JSON.parse(sessionStorage.flashyBack || '[]').flatMap(([front, before, skipped]) => {
      const card = state.cards.find(c => c.front === front);
      return card ? [{ card, before, skipped }] : [];
    });
  } catch { return []; }
})();
const remember = () => {
  answered = answered.slice(-200);
  try { sessionStorage.flashyBack = JSON.stringify(answered.map(a => [a.card.front, a.before, a.skipped])); } catch {}
};

// "due today" trains only cards due today or overdue; "all cards" runs the whole deck.
const allMode = () => state.mode === 'all';
function setMode(mode) { state.mode = mode; save(); startSession(); }
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

let resume = new URLSearchParams(location.search).get('card'); // the card on screen before a reload

function startSession() {
  queue = shuffle(state.cards.filter(c => allMode() || c.due <= today()));
  const first = resume ?? cur?.front; // the card from before a reload, or the one on screen before a tab switch
  const i = queue.findIndex(c => c.front === first);
  if (i > 0) queue.unshift(...queue.splice(i, 1));
  resume = null;
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
  remember();
  review(cur, ok);
  if (!ok) queue.push(cur); // back at the end of this session
  save(); next();
}

// Back undoes the last step. An answer is taken back (old level and counts) and its card shows again,
// flipped; a skipped card simply comes back, unflipped.
function back() {
  let last;
  do last = answered.pop(); while (last && !state.cards.includes(last.card)); // pass over cards deleted since
  if (!last) return;
  Object.assign(last.card, last.before);
  const queued = queue.indexOf(last.card); // "again" or a skip had put it at the end of the queue
  if (queued !== -1) queue.splice(queued, 1);
  if (cur && cur !== last.card) queue.unshift(cur);
  cur = last.card;
  flipped = !last.skipped;
  remember(); save(); render();
}

// Skip moves an unflipped card to the end of the session. Once you've seen the answer,
// moving on without "got it" counts as "again".
function skip() {
  if (flipped) return grade(false);
  if (cur && queue.length) { answered.push({ card: cur, before: { ...cur }, skipped: true }); remember(); queue.push(cur); next(); }
}

$('#card').onclick = $('#flip').onclick = flip;
$('#again').onclick = () => grade(false);
$('#got').onclick = () => grade(true);
$('#all').onclick = () => setMode('all');
$('#go-add').onclick = () => show('add');
$('#reverse').onchange = e => { state.reverse = e.target.checked; save(); render(); };

document.onkeydown = e => {
  if ($('#ask').open || $('#train').hidden || e.target.matches('textarea, input:not([type=checkbox])')) return;
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

// Ticked cards (only on the Deck tab), or the whole deck. Without progress they go out as new cards.
const picks = () => $('#deck').hidden ? [] : state.cards.filter(c => picked.has(c));
const shareCards = withProgress => {
  const some = picks(), cards = some.length ? some : state.cards;
  return withProgress ? cards : cards.map(c => newCard(c.front, c.back, c.set));
};

function updateShare() {
  $('#share-block').hidden = !state.cards.length; // nothing to move or share yet
  const some = picks().length, what = some ? `copy ${some} selected` : 'copy link';
  for (const b of [$('#share-progress'), $('#share-fresh')]) { clearTimeout(b.timer); delete b.dataset.label; } // drop a pending "✓ copied"
  $('#share-progress').textContent = `${what} with my progress`;
  $('#share-fresh').textContent = `${what} without progress`;
  $('#unselect').hidden = !some;
  $('#link').hidden = true;
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

$('#reset').onclick = async () => {
  if (!await ask('Reset progress?', `All ${state.cards.length} cards go back to new. The cards themselves stay.`,
    [['reset progress', true, 'primary'], ['cancel', null]])) return;
  state.cards = state.cards.map(c => newCard(c.front, c.back, c.set)); save(); renderDeck();
};
$('#clear').onclick = async () => {
  if (!await ask('Delete all cards?', `All ${state.cards.length} cards and their progress will be gone from this browser. Links you already shared keep working.`,
    [[`delete all ${state.cards.length} cards`, true, 'primary'], ['cancel', null]])) return;
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

// The clicked button itself says what happened, for two seconds, then shows its label again.
function say(button, text, ms = 2000) {
  button.dataset.label ??= button.textContent;
  button.textContent = text;
  clearTimeout(button.timer);
  if (ms) button.timer = setTimeout(() => { button.textContent = button.dataset.label; delete button.dataset.label; }, ms);
}

function copyLink(cards, field, button) {
  say(button, 'making link…', 0);
  const link = pack(cards).then(shortLink);
  // Safari only lets a click write to the clipboard if the write starts right away, so it gets the link as a promise.
  const copied = (typeof ClipboardItem === 'function'
    ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': link.then(l => new Blob([l], { type: 'text/plain' })) })])
    : link.then(l => navigator.clipboard.writeText(l))
  ).then(() => true, () => false); // a refused copy just means: copy it by hand from the field
  link.then(async l => {
    field.value = l;
    field.hidden = false;
    field.select();
    say(button, await copied ? '✓ copied' : 'copy it from the box below');
  });
}

$('#share-progress').onclick = e => copyLink(shareCards(true), $('#link'), e.currentTarget);
$('#share-fresh').onclick = e => copyLink(shareCards(false), $('#link'), e.currentTarget);

// `ref` is what follows the # in a share link: "s=<id>" for a short link, or the deck itself.
async function importDeck(ref) {
  let cards;
  try {
    const res = ref.startsWith('s=') && await fetch('/api/decks/' + encodeURIComponent(ref.slice(2)));
    if (res && !res.ok) throw new Error(res.status);
    cards = await unpack(res ? await res.text() : ref);
  }
  catch { return ask("Couldn't read that link", 'It may be cut off or mistyped. Copy it again on the other device and paste the whole link into the address bar.'); }
  const { added, updated, kept } = planImport(state.cards, cards);
  const count = (n, what) => `${n} ${what}${n === 1 ? '' : 's'}`;
  const sets = [...new Set(added.map(c => c.set).filter(Boolean))];
  if (!added.length && !updated.length && !kept.length)
    return ask('Nothing new', `You already have all ${count(cards.length, 'card')} from this link` + (cards.some(c => c.right || c.wrong) ? ', with the same progress.' : '.'));

  const buttons = [];
  if (added.length || updated.length) buttons.push([added.length && updated.length ? 'add and update' : added.length ? `add ${count(added.length, 'card')}` : 'update', 'merge', 'primary']);
  if (kept.length) buttons.push([`use the link's progress for all`, 'all', buttons.length ? '' : 'primary']);
  buttons.push(['cancel', null]);
  const choice = await ask(sets.length ? `Add cards from “${sets.join('”, “')}”` : 'Import cards', [
    added.length && `${count(added.length, 'new card')} will be added.`,
    updated.length && `${count(updated.length, 'card')} you already have will take the link's progress.`,
    kept.length && `${count(kept.length, 'card')} keep${kept.length === 1 ? 's' : ''} your progress here, because you answered ${kept.length === 1 ? 'it' : 'them'} more recently on this device. To match the link exactly, use the link's progress for all.`,
  ], buttons);
  if (!choice) return;
  state.cards.push(...added);
  updated.forEach(([mine, from]) => takeProgress(mine, from));
  if (choice === 'all') kept.forEach(([mine, from]) => takeProgress(mine, from));
  save(); show('train');
}


function importFromHash() {
  if (location.hash.length < 2) return;
  const code = location.hash.slice(1);
  history.replaceState(null, '', location.pathname + location.search); // don't re-import on reload
  importDeck(code);
}

window.onhashchange = importFromHash; // link pasted into a tab that already has the page open
show('train');
importFromHash();
