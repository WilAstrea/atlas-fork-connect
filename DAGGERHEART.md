# Daggerheart sheets for Atlas VTT Connect (fork)

This fork of [Atlas VTT Connect](https://github.com/evolJoaoBento/atlas-vtt-connect) adds Daggerheart character sheets
and domain cards for online players. Players use them from the web join page; the GM keeps every character as a note
in the vault.

## What it does

- **Import from Heart of Daggers.** Command palette → *Import Heart of Daggers PDF*. Pick the PDF that Heart of
  Daggers exports (it is a fillable form). You are asked which player plays the character: give the name they join the
  online session with. The note goes to `Daggerheart/Characters/<name>.md`.
- **Re-import keeps the game.** Importing the same character again replaces the build (traits, cards, gear,
  features) but keeps HP, Stress, Hope, armor slots, conditions, card tokens, the player and card art.
- **The GM's sheet.** The note shows the sheet in a `daggerheart-sheet` code block. The GM can change any track,
  condition, token or card from there.
- **The player's sheet.** In an online session, the player named in the note gets a **DH** button on the join page.
  It opens their sheet:
  - Traits, Evasion, Armor, thresholds, HP, Stress, Hope, armor slots and conditions.
  - Weapons, Experiences, and features.
  - The loadout as cards (with tokens for cards that use them) and the vault.

  The player can mark tracks, toggle conditions, count card tokens and move cards between loadout and vault (5 cards at most).
- **Rolls in Atlas's dice log.** Trait buttons, *Roll to hit*, *Spellcast roll*, *Roll damage* and card rolls
  (Unleash Chaos d10s) are built by the GM's Connect from the note, never sent as a formula by the player. They are
  rolled by Atlas under the player's name and appear in Atlas's dice log and toasts:
  - Duality dice are `2d12` (Hope die first). Advantage adds `+1d6` and disadvantage `-1d6`.
  - Experiences picked for a roll cost 1 Hope each and add their bonus.
  - A roll with Hope gains a Hope. A critical (matching dice) gains a Hope and clears a Stress.
  - A roll with Fear tells the GM (Fear +1).
  - Critical damage adds the dice's maximum.

## The player's table (web page)

- **Tabs** at the top: 1 Mesa (the map), 2 Ficha (the sheet), 3 Inventario, 4 Mapa (coming next). Keys 1–4 switch them.
- **Atlas widgets** (Fear, a torch timer…) show as badges at the top right, in their own colour and icon.
- **Bottom left**: the dock with the **Chat** and the **Dice log**; rolls appear above it.
- The page's other buttons (menu, sheets, shown image) are at the bottom right.
- **Chat**: players and the GM write to the whole table. A player clicks one of their loadout or vault cards to share it.
  Cards lift on hover. The GM gets the shared card as the note has it, never a copy the player could alter. The GM
  reads and writes in Obsidian with *Open session chat*. The chat lasts for the session.

## Portrait Stage and the world map (add-ons, `src/addons/`)

- **Portrait Stage for Atlas VTT**: while that plugin is enabled, the GM's stage reaches web players as it does
  Atlas's player window, over the map and under the page's panels:
  - portraits, spotlight, emotions, the out-of-scene bench and HP bars;
  - film bars, blur and rain;
  - shakes and flashes.

  It is drawn by Portrait Stage's own renderer (`vendor/portrait-stage`, MIT, copied unchanged). Pictures go
  through Connect's asset channel by fingerprint; neither file paths nor file names leave the GM's machine. Portrait
  Stage itself needs no change.
- **Mapa tab**: the image `Daggerheart/Theme/world_map.(webp|png|jpg)` in the vault is the world map players see,
  to pan (drag) and zoom (wheel; double click fits). Replace the file and it updates. No pins yet.

Both are images beyond the scene's, served through the asset server's one extra-files hook (`extraAssets.ts`)
and kept in the player's memory only.

## Private sheet art

Put the art in the vault folder `Daggerheart/Theme/`, named `hp_bg`, `heart_left`, `heart_right`, `hope_bg`,
`hope_gem`, `stress_bg`, `stress_gem`, `armor_gem_left` and `armor_gem_right` (`.webp`, `.png`, `.jpg` or `.gif`).
The GM's sheet uses it directly. Players get it, scaled down, over the session when they join. It is never part of
this repository or of the published page. Without the folder, the sheet draws its own plain pips.

## Note format

```yaml
dh-character: 1
player: Wil            # the player's name in the online session
build: { ... }         # from the PDF; replaced by a re-import
state: { hp, stress, hope, armorSlots, conditions, cardTokens }   # live play; never replaced by an import
```

Card art: set `build.domainCards[n].art` to a vault image path. It shows on the GM's sheet now. Sending art to web
players is not done yet.

## Code

Everything lives in `src/daggerheart/` and `online-client/daggerheart/`. Connect's own files are touched only at a few
hook points, to keep merges from upstream cheap:

- `protocol.ts`: adds the `dh-*` message types.
- `hostedSession.ts` and `OnlineSessionService.ts`: add the `daggerheart` part.
- `DiceHost.ts`: adds `rollResultFor`, which returns Atlas's roll.
- `PlayerSession.ts`: adds `onDaggerheart` and `sendDaggerheart`.
- `startConnect.ts`, `main.ts`, `online-client/main.mts`, `online-client/index.html` and `styles/main.scss`: wire it in.

Tests: `tests/unit/online/daggerheart/`.

## Not yet

- Fear is counted per session only.
- No level-up in the sheet (do it in Heart of Daggers and re-import).
- SRD card library for characters not made in Heart of Daggers.
- Card art for web players.
- Pins and a quest journal on the world map.
- Spanish translation.
