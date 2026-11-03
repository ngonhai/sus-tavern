# Sus Tavern (demo)

A Liar's Bar–style bluffing game, built from the Roulette project. Static HTML/JS, no build step — open `index.html` through any static server.

- 2–5 players per room (online via Firebase, same project config as Roulette: `rooms/sus_<CODE>`), or vs 1–4 bots offline. Extra people joining a code become spectators.
- Characters: pig, fox, dog, goat, octopus, penguin, hawk, turtle — pick yours in the lobby; bots (host adds/removes them in the waiting room) get random free ones. **The table order is shuffled when the game starts**.
- Rules: each round has a table card (Ace/King/Queen), 5 cards each. Play 1–3 cards face-down claiming they match, or call the previous player a liar. Jokers are wild. Loser of the call pulls their own revolver (6 chambers, 1 bullet, each pull advances it). No cards left = you must call. Last one alive wins.
- Option **Devil card**: one extra card that looks exactly like a Joker in hand but is never honest (not wild); if it is revealed, everyone alive pulls the trigger in turn (starting with the accused). A real Joker is always safe.
- Hover a revolver (3D) or a seat chip (2D) to see its chambers; tap on touch screens. Calling "Liar!" plays a synthesized shout.
- First-person 3D round table (Three.js, vendored): only your own paws are visible, click your 3D cards to select, press *Play* (or Enter) to play, click your revolver to pull. 2D mode (button in the header) is a full fallback.
- Style: painted/brushy — toon shading with brush-streak texture and ink outlines on 3D animals, wobbly SVG faces, hand-drawn card glyphs and an SVG "scratch" filter on lettering.

Leaving the table (✕ or "Leave table") asks for confirmation first (Esc = stay); the popup stays open while the game keeps moving (new turn, round, rematch) and only closes when you choose, the game ends or the room is gone.

Keys: Enter = play, L = call liar, P/Space = pull. Tests: `node tests/engine.test.js`.
Note: the whole game state lives in the room (hands included) — fine for friends, not cheat-proof.

## 3D gestures
- Double-click the table: slam it with both fists (can't spam: next slam only after the animation ends; also shown to other players online).
- Click an animal: point at them.
- BGM is now a soft jazz loop (Dm7–G7–Cmaj7–A7, walking bass, brushed ride, vibes).

## Table options
- **Shared gun**: the whole table shares ONE 6-chamber revolver (1 bullet). Every loser pulls the same trigger and the chamber keeps advancing until someone dies, then the gun is reloaded. In 3D the gun slides to whoever has to shoot; the "Shared gun" chip in the header shows (hover/click) the chambers left — it is public information.
- **Joker (gold star)**: off by default. When off the deck is only Ace/King/Queen (a few more cards per kind so everyone still gets 5), plus the Devil if enabled.

## Running out of cards
Players with no cards are skipped. When nobody else holds a card, the last play is turned over automatically (no one is forced to call): a lie → the player pulls the trigger; the truth → nobody pulls and a new round is dealt. A Devil in that play still makes everyone else pull.

## Bot levels
- **Easy (0)**: misjudges claims and sometimes throws random cards.
- **Normal (1)**: plays by expected "shots" — Bayesian estimate of how likely the last claim is a lie (own hand, cards it played, hand sizes, claim size, caught-bluff history), every option scored by risk to itself vs. risk put on others using the real chamber positions (and the shared gun). Learns per opponent how often they call claims of 1/2/3 cards (`g.st`) and bluffs more against players who rarely call.
- **Hard (2)**: like a careful human — hypergeometric model of the unseen table cards, weighs the real danger of the guns before calling, uses the Devil as a free lie / sweep, bluffs sparingly.
- Normal and Hard never peek at hidden cards (tests scramble them and check the same move is chosen). In 2v2 duels Hard beats Normal ~75–80% and Normal beats Easy ~90%.
- Both bots judge only the LAST play (the one a call would flip): earlier plays of the same player this round may have been unchecked lies, so they are not added up as if true (the old bots could be baited by 3 fake cards followed by 1 real card).

## Bot table talk (Hard bots only)

A hard bot speaks only to make the player who has to decide doubt the play before it and shout "Liar!". Two kinds of line (quotes in `i18n.js` → `talk.acc` / `talk.accNo`, both languages):

- **acc** — quotes how many table cards it holds ("Tao giữ 3 lá K rồi, {to} đánh thật sao nổi?"). Used when it believes the accusation and really holds ≥ 2 table cards, or as a **bluff** with a made-up but possible count (≥ 2, never more than its hand).
- **accNo** — a plain accusation with no count ("Nhìn mặt {to} là biết đang lừa rồi."). Used when it believes the accusation but holds a weak hand (saying "I hold 1" would only advertise weakness), or as pure pressure.

It stays quiet when the play may hide the Devil (a call would make the bystander shoot too). The speaker and the player who just played never overlap; at most one line per play.

- The line is a normal game action (`{t:'talk', k:'doubt', n, v}`), so it is in the same room write as any move and every client shows the same variant (`v`). A talk never changes whose turn it is.
- The decider (a hard bot) weighs the player before it (claim size, bluff history, unseen cards) against what the speakers say. A count is trusted only partly (`HB.hear`), less if it is impossible, contradicts the speaker's other lines or its own later plays, or the counts together exceed the cards that exist. A plain accusation moves nobody. See the "round ledger" comments in `sus-engine.js`.
- 2D: a bubble over the avatar (flips below it when the avatar is near the top). 3D: a flat board above the head with the speaker's name; it follows the camera, keeps a slight angle toward the table, scales with distance and is kept inside the view (drops down and steps aside when the animal sits high on screen).
