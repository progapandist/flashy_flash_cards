# Flashy Flash Cards

A flashcard trainer in one HTML file. No build step, no dependencies, no server: open `index.html` in a browser.

## Use

**Add.** Paste vocabulary, one pair per line, foreign word first:

```
hilfreich — полезный, помогающий
die E-Mail - письмо
nirgends | нигде
```

Separators, in priority order: `—` `–` `|` ` - ` `;`. The first one found in a line wins, so a `;` inside the translation stays put and `E-Mail` stays whole. Click "detect pairs", fix any row that came out wrong, then add. The app skips cards whose front you already have.

**Train.** You see only the cards due today. Each card has a level from 0 to 6, and the level sets how many days pass before it comes back:

| level | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| days | 0 | 1 | 2 | 4 | 8 | 16 | 32 |

"Got it" moves a card up one level. "Again" drops it to 0 and puts it at the end of today's session, so you keep seeing it until you get it right.

When nothing is due, "practice all anyway" runs the whole deck. Early practice adds to ✓ but leaves levels and due dates as they were.

Keys: Space or Enter flips, 1 means again, 2 means got it. "Show translation first" reverses the cards.

**Deck.** Lists every card with its level, due date, and ✓/✗ counts. You can delete one card, reset progress, or delete everything.

## Sharing

"Copy share link" packs the whole deck and its progress into the link, after the `#` (JSON, deflate, base64url). Opening the link adds the cards you don't have yet and skips fronts already in your deck.

A link to a local file works only on the computer that made it. To move a deck to another laptop, send `index.html` and the link, then paste the link (or the part after `#`) into the import field on the Deck tab.

## Storage

The deck lives in the browser's `localStorage` under the key `flashy`, one deck per browser. If you clear site data, you lose the deck. Send yourself a share link as a backup.
