# Changelog

## 0.12.1 — "this might lag" tooltips

- Every **Add** button now says so on hover: *"The game may freeze for a few seconds while
  the items are added."*
- Spreading the adds across frames was tried and **reverted**: a bank write wakes every
  listener in the game and in every other mod loaded, and dribbling those out over a couple
  of seconds felt worse to use than one honest pause. The freeze is inherent, so the mod
  warns about it instead of hiding it.

## 0.12.0 — Item Adder: pagination

- The grid is now **paged** (600 cells per page, `‹ Prev` / `Next ›` beneath it) instead of
  truncated at 600 with "refine your search to see more". Every item in the game is now
  reachable by browsing — previously, anything past the 600th match in a category simply
  could not be seen without narrowing the search until it happened to surface.
- The hint line reads `Showing 601–1,200 of 3,412` rather than a cut-off warning.
- `Select all` takes the **current page**, and selection survives paging, so
  Select all → Next → Select all accumulates across pages.

## 0.11.0 — Item Adder: Select all

- **`Select all`** in the Item Adder selects every entry currently shown in the grid, so a
  search or category can be added in one go. It selects what's *on screen* — the grid caps
  itself at 600 cells, and with "All categories" that cap is doing a lot of work, so
  selecting every match would have quietly picked ~3,400 entries you never saw. The hint
  line still tells you when matches were cut off.

## 0.10.0 — Item upgrades

- The bank's **Upgrade Item** modal gets an `Add items ▾` dropdown in its cost row, adding
  the materials for **N** upgrades. Costs come from the `ItemUpgrade`'s own
  `itemCosts`/`currencyCosts` — there's no modifier-aware getter for these, and
  `bank.getMaxUpgradeQuantity()` reads exactly those arrays, so they are what the game
  charges.
- After adding, the modal replays `setUpgrade()` with the arguments it was last given.
  The game hides the Upgrade buttons when you can't afford the cost and never re-renders
  the modal on a bank change, so without this you'd have topped up and still have no way
  to upgrade without closing and reopening it.

## 0.9.0 — Construction

- **Construction** (the third-party `rielkConstruction` skill) now gets an `Add items`
  button next to **Build** on every room panel. It tops up the card's whole
  **"Costs Remaining"** box, so the fixture's current tier can be built out in full.
  Costs come from `fixture.getTotalRemainingCost()` — the same `UIcost` the card renders,
  so cost modifiers are respected — and the fixture is read at click time, since a room
  panel is reused for every fixture in that room.
- Construction's refresh repaints the panel's cost icons directly instead of going through
  `safeRender()`. The generic helper flips *every* boolean in a skill's render queue, and
  Construction's `renderfixtureItemUpdates` reaches `activeBuildRecipe` — a getter that
  throws unless a build is running. It threw before the flag was cleared, so the game
  crashed on every frame after a top-up.
- Artisan re-injection now also covers **subclassed** crafting menus. Construction's
  Materials tab is a `<cons-artisan-menu>`, not the base `<artisan-menu>`, so its dropdown
  disappeared whenever it re-rendered.

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
