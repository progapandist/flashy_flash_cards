import { expect, test } from 'bun:test';
import { parse, review, newCard, newOnly, pack, unpack, encode, INTERVALS } from './cards.js';

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

  review(c, false, day + 1);
  expect([c.level, c.due, c.wrong]).toEqual([0, day + 1, 1]);
});

test('newOnly: skips fronts already in the deck and repeats in the batch', () => {
  const deck = [newCard('a', '1')];
  const fresh = newOnly(deck, [newCard('a', 'x'), newCard('b', '2'), newCard('b', 'y')]);
  expect(fresh.map(c => c.back)).toEqual(['2']);
});

test('pack/unpack round-trip, and unpack cleans hostile input', async () => {
  const deck = [
    { ...newCard('hilfreich', 'полезный'), level: 3, due: 20000, right: 4, wrong: 1 },
    newCard('nirgends', 'нигде', 'Nachbarn'),
  ];
  expect(await unpack(await pack(deck, 20010))).toEqual(deck);

  const evil = await encode(JSON.stringify([5, ['<img>', null, 'x'], ['b', 'y', ''], [99, 'x', -3, 1e99]]));
  expect(await unpack(evil)).toEqual([{ front: '<img>', back: 'b', set: '', level: 6, due: 0, right: 0, wrong: 0 }]);
  await expect(unpack('garbage!!')).rejects.toThrow();
  await expect(unpack(await encode('{"not": "a deck"}'))).rejects.toThrow();
});
