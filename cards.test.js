import { expect, test } from 'bun:test';
import { parse, review, newCard, planImport, takeProgress, pack, unpack, encode, INTERVALS } from './cards.js';

test('parse: first separator wins, lines without one keep an empty back', () => {
  expect(parse(`
die Herausforderung — трудность; сложная задача
die E-Mail - письмо
nirgends | нигде
eins; один
der / die Gleichgesinnte – единомышленник
broken line
`)).toEqual([
    ['die Herausforderung', 'трудность; сложная задача'],
    ['die E-Mail', 'письмо'],
    ['nirgends', 'нигде'],
    ['eins', 'один'],
    ['der / die Gleichgesinnte', 'единомышленник'],
    ['broken line', ''],
  ]);
});

test('review: climbs the intervals, "again" resets, early practice does not promote', () => {
  const c = newCard('a', 'b');
  let day = 100;
  for (let level = 1; level <= 6; level++) {
    review(c, true, day);
    expect([c.level, c.due]).toEqual([level, day + INTERVALS[level]]);
    day = c.due;
  }
  review(c, true, day);
  expect(c.level).toBe(6); // top level stays

  review(c, true, day + 1); // not due yet
  expect([c.level, c.right]).toEqual([6, 8]);

  review(c, false, day + 1, 5000);
  expect([c.level, c.due, c.wrong, c.seen]).toEqual([0, day + 1, 1, 5000]); // seen: when it was answered
});

test('planImport: adds new fronts once, keeps whichever progress is newer, never resets from a fresh link', () => {
  const older = { ...newCard('a', '1'), level: 1, due: 10, right: 1, seen: 100 };
  const newer = { ...newCard('n', '2'), level: 0, due: 30, wrong: 1, seen: 300 };
  const same = { ...newCard('s', '3'), level: 2, due: 20, right: 2, seen: 200 };
  const untimed = { ...newCard('u', '4'), level: 1, due: 10, right: 1 }; // answered before times were kept
  const deck = [older, newer, same, untimed];
  const linked = [
    { ...newCard('a', 'x'), level: 4, due: 40, right: 5, wrong: 2, seen: 200 }, // newer than mine → taken
    { ...newCard('n', 'x'), level: 2, due: 20, right: 2, seen: 200 },          // older than mine → kept
    { ...same },                                                              // identical → nothing to do
    { ...newCard('u', 'x'), level: 3, due: 30, right: 3 },                    // no times either side → link wins
    newCard('b', '5'), newCard('b', 'repeat'),                                // new, repeated in the link
  ];
  const { added, updated, kept } = planImport(deck, linked);
  expect(added.map(c => c.back)).toEqual(['5']);
  expect(updated.map(([m]) => m.front)).toEqual(['a', 'u']);
  expect(kept.map(([m]) => m.front)).toEqual(['n']);
  updated.forEach(([m, from]) => takeProgress(m, from));
  expect(older).toEqual({ front: 'a', back: '1', set: '', level: 4, due: 40, right: 5, wrong: 2, seen: 200 }); // text stays mine
  expect(newer.level).toBe(0);

  // a link without progress never resets yours
  expect(planImport(deck, [newCard('a', '1')]).updated).toEqual([]);
});

test('pack/unpack round-trip, and unpack cleans hostile input', async () => {
  const deck = [
    { ...newCard('hilfreich', 'полезный'), level: 3, due: 20000, right: 4, wrong: 1, seen: 1791500000 },
    newCard('nirgends', 'нигде', 'Nachbarn'),
  ];
  expect(await unpack(await pack(deck, 20010))).toEqual(deck);

  const evil = await encode(JSON.stringify([5, ['<img>', null, 'x'], ['b', 'y', ''], [99, 'x', -3, 1e99]]));
  expect(await unpack(evil)).toEqual([{ front: '<img>', back: 'b', set: '', level: 6, due: 0, right: 0, wrong: 0, seen: 0 }]);
  await expect(unpack('garbage!!')).rejects.toThrow();
  await expect(unpack(await encode('{"not": "a deck"}'))).rejects.toThrow();
});
