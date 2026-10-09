# Flashy Flash Cards

A flashcard trainer for vocabulary. Plain HTML, CSS and JavaScript: no build step, no dependencies. It runs at https://flashy.progapanda.org.

## Use

**Add.** Paste vocabulary, one pair per line, foreign word first:

```
hilfreich — полезный, помогающий
die E-Mail - письмо
nirgends | нигде
```

Separators, in priority order: `—` `–` `|` ` - ` `;`. The first one found in a line wins, so a `;` inside the translation stays put and `E-Mail` stays whole. Click "detect pairs" and fix any row that came out wrong. Rows whose front is already in your deck, or repeats an earlier row, show a dashed border; "add all" keeps them and "add without duplicates" drops them.

The set name is optional. Cards keep it, and Train shows it above each card from that set.

**Train.** You see only the cards due today. Each card has a level from 0 to 6, and the level sets how many days pass before it comes back:

| level | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| days | 0 | 1 | 2 | 4 | 8 | 16 | 32 |

"Got it" moves a card up one level. "Again" drops it to 0 and puts it at the end of today's session, so you keep seeing it until you get it right.

When nothing is due, "practice all anyway" runs the whole deck. Early practice counts toward "right" but leaves levels and due dates as they were.

Keys: Space or Enter flips, 1 means again, 2 means got it. ← takes back your last answer and shows that card again, or brings back a card you skipped; press it more times to go further back. It keeps working after a reload or a tab switch. → skips a card to the end of the session; after you flip it, → counts as "again". "Show translation first" reverses the cards. The address bar keeps the card you're on (`?card=…`), so a reload brings you back to it.

**Deck.** Lists every card with its set, level, due date, and right/wrong counts. You can delete one card, reset progress, or delete everything.

## Sharing

A share link is short, like `flashy.progapanda.org/#s=ENYNKCTDKov_`, whatever the deck size. The app stores the cards on the server (Cloudflare KV) under an id made from their hash, so sharing the same cards twice gives the same link. Anyone who has a link can open those cards. Opening one (paste it into the address bar) adds the cards you don't have yet, then opens Train. Open it in a real browser app such as Safari, Chrome or Firefox. If you tap a link inside Telegram, WhatsApp or another chat app, it opens in that app's built-in browser, which keeps its own separate deck that you won't find in your normal browser. The app says this right under the share buttons.

You can make one in three places:

- **A set, for a class.** On the Add tab, after "detect pairs", name the set and click "copy link to these cards". You can share them without adding them to your own deck.
- **Some cards.** On the Deck tab, tick cards; the buttons change to "copy N selected…".
- **The whole deck.** Under the card on Train, or on Deck with nothing ticked.

The "Move or share your cards" block sits under the card on Train and at the bottom of Deck; it's the same block in both. "Copy link with my progress" carries levels, due dates and right/wrong counts: open that link in another browser or on another device to continue there. "Copy link without progress" is for someone who hasn't practiced yet; they start from level 0. On Train the links always cover the whole deck; on Deck they cover the ticked cards, if any. Set links from the Add tab always start fresh.

When a link with progress lands in a deck that already has some of its cards, each of those cards keeps whichever progress is newer: each card remembers when you last answered it. So you can practice on your laptop and your phone and move progress either way without losing answers. The confirm says how many cards change; their text and set stay as they are. A link without progress never touches your progress.

If the app can't reach the server, it falls back to a link that carries the cards themselves after the `#`. Those grow with the deck: about 1,400 characters for 20 cards, 6,000 for 100 and 49,000 for 1,000, too long for Telegram (4,096 characters per message) past about 65 cards. Older links in that format still open.

## Storage

The deck lives in the browser's `localStorage` under the key `flashy`, one deck per browser. If you clear site data, you lose the deck. Send yourself a share link as a backup.

## Develop

| file | what it holds |
|---|---|
| `index.html` | markup |
| `style.css` | styles |
| `cards.js` | logic with no DOM: parser, scheduling, share codes |
| `app.js` | wires `cards.js` to the page and `localStorage` |
| `cards.test.js` | tests for `cards.js` |
| `functions/api/decks/` | Cloudflare Pages Functions that save and load shared decks |
| `wrangler.toml` | Pages config: project name and the `DECKS` KV binding |
| `server.js` | dev server with live reload; passes `/api` to wrangler |

`make dev` serves the app on port 3000 and reloads the browser on save. In the background it runs `wrangler pages dev` on port 8788 for the deck API, with a local copy of the deck storage in `.wrangler/`, so testing never touches the real decks. Ctrl-C stops both. `make test` runs the tests. You need Bun and wrangler. The page loads ES modules, so opening `index.html` from disk won't work; use `make dev`.

`make deploy` runs the tests, copies the four browser files into `dist/` and uploads them to the Cloudflare Pages project `flashy` with wrangler. `make deploy-commit` does the same, then commits everything with a timestamp and pushes.
