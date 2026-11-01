# Sus Tavern (demo)

A Liar's Bar–style bluffing game, built from the Roulette project. Static HTML/JS, no build step — open `index.html` through any static server.

- 2–5 players per room (online via Firebase, same project config as Roulette: `rooms/sus_<CODE>`), or vs 1–4 bots offline. Extra people joining a code become spectators.
- Characters: pig, fox, dog, goat, octopus, penguin, hawk, turtle — pick yours in the lobby; bots (host adds/removes them in the waiting room) get random free ones. **The table order is shuffled when the game starts**.
- Rules: each round has a table card (Ace/King/Queen), 5 cards each. Play 1–3 cards face-down claiming they match, or call the previous player a liar. Jokers are wild. Loser of the call pulls their own revolver (6 chambers, 1 bullet, each pull advances it). No cards left = you must call. Last one alive wins.
- Option **Devil card**: one extra card that looks exactly like a Joker in hand but is never honest (not wild); if it is revealed, everyone alive pulls the trigger in turn (starting with the accused). A real Joker is always safe.
- Hover a revolver (3D) or a seat chip (2D) to see its chambers; tap on touch screens. Calling "Liar!" plays a synthesized shout.
- First-person 3D round table (Three.js, vendored): only your own paws are visible, click your 3D cards to select, press *Play* (or Enter) to play, click your revolver to pull. 2D mode (button in the header) is a full fallback.
- Style: painted/brushy — toon shading with brush-streak texture and ink outlines on 3D animals, wobbly SVG faces, hand-drawn card glyphs and an SVG "scratch" filter on lettering.

Keys: Enter = play, L = call liar, P/Space = pull. Tests: `node tests/engine.test.js`.
Note: the whole game state lives in the room (hands included) — fine for friends, not cheat-proof.

## 3D gestures
- Double-click the table: slam it with both fists (can't spam: next slam only after the animation ends; also shown to other players online).
- Click an animal: point at them.
- BGM is now a soft jazz loop (Dm7–G7–Cmaj7–A7, walking bass, brushed ride, vibes).
