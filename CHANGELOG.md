# Changelog

## 0.8.x — Township, tasks and refresh fixes

- **Township tasks now work.** `completeTask()` gates on `goals.checkIfMet()`, a method
  that recomputes every goal from the bank/stats and ignores the `isMet` flags — so
  marking goals met completed nothing. The `Claim` button now shadows `checkIfMet()` (and
  `removeItemsFromBank()`, which would take items you never collected) for the duration of
  the call, then hands off to the game's own `completeTask()` so rewards are paid properly.
- **Township GP fixed.** Township's "GP" is not a town resource — it's the player's GP in
  disguise (the town pool held 131M while the player had 24k, and buildings charge the
  player). Any township cost backed by a player currency is now treated as a currency cost.
- Farming seeds got a quantity dropdown, and the modal's "Seeds in Bank" now refreshes in
  place instead of needing a reopen.
- Fixed buttons going stale when the game **reuses** an element for a different task,
  recipe or building — targets are now resolved at click time, not captured at injection.

## 0.6.x – 0.7.x — Fixes

- Fixed the "No costs" bug on Township: the dropdown only checked item/currency costs and
  ignored the third kind (town resources).
- Township build is a dropdown with a **`Max (N)`** option (N = builds remaining until the
  next upgrade). The old plain top-up couldn't work: "Max" means *as many as you can
  afford*, so funding one build made Max = 1.
- **Fixed UI refresh everywhere.** Melvor's `render*` methods early-return unless their
  `renderQueue` flag is set, so calling them directly did nothing — the items went in but
  the screen kept showing stale numbers.
- Buttons now also appear on menus that were rendered **before** the mod loaded (previously
  they only showed up after you changed your selection).
- Removed a stray Add button from the "Select Dig Site Map" picker.
- Item Adder: currencies are listed first so they aren't pushed off the render cap.

## 0.5.0 — Six more screens

- **Cooking** (per category), **Firemaking** (logs + oil), **Farming** (seeds + plot
  unlocks), **Cartography** (paper, map creation, map upgrades, refinement), and
  **Township** (build/upgrade, repair).
- Added a third cost kind — **town resources** — alongside items and currencies.

## 0.4.0 — Astrology + crafting skills

- **Astrology:** split button that adds the Stardust for one upgrade, with `Add max` for
  every remaining level of a modifier.
- **Artisan skills** (Smithing, Fletching, Crafting, Runecrafting, Herblore, Summoning):
  a quantity dropdown that adds the materials to make the selected recipe **N times**.

## 0.3.0 — Agility

- Cost-filler button on Agility obstacles and pillars, priced through
  `getObstacleBuildCosts` / `getPillarBuildCosts` so cost-reduction modifiers are respected.

## 0.2.0 — Item Adder + currency

- **Item Adder** settings page: searchable, category-filtered grid of every item and
  currency, with multi-select and a quantity field.
- Shop buttons now fill **currency** costs (GP, Slayer Coins, …), not just items.

## 0.1.x — Shop

- Initial release: an `Add items` button on shop purchases that tops up the missing item
  costs.
