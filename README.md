# Shop Requirement Filler

A Melvor Idle cheat/QoL mod that adds **cost-filler buttons** across the game, plus an
**Item Adder** page for spawning anything into your bank.

Wherever the game shows you a cost you can't afford, this mod puts a button next to it
that gives you exactly what's missing.

## Features

### Cost buttons

| Where | Button | What it does |
| --- | --- | --- |
| **Shop** | `Add items` | Tops up the item + currency costs of a purchase/upgrade |
| **Agility** | `Add items` | Tops up an obstacle's or pillar's build costs |
| **Astrology** | `Add` + `▾ Add max` | Adds the Stardust for one upgrade, or for every remaining level |
| **Smithing / Fletching / Crafting / Runecrafting / Herblore / Summoning** | `Add items ▾` | Adds the materials to make the selected recipe **N times** |
| **Cooking** | `Add items ▾` | Same, per cooking category (fire / furnace / pot / …) |
| **Firemaking** | `Add items ▾` / `Add` | Logs to burn N times; oil for "Oil my Logs" |
| **Farming** | `Add items ▾` / `Add` | Seeds to plant N times; items to unlock a plot |
| **Cartography** | `Add items ▾` / `Add` | Paper N times, map creation, map upgrades, refinement slots |
| **Township** | `Add items ▾` (with `Max`) | Town resources to build/upgrade N times, or repair |
| **Township tasks** | `Claim` | Force-completes a task and pays out its rewards |

Notes:

- Costs are always read through the game's **modifier-aware** getters (e.g.
  `getObstacleBuildCosts`, `getRecipeCosts`), so cost-reduction bonuses are respected —
  you get the reduced amount actually shown on the card, not the base cost.
- The dropdowns have `x1 / x10 / x100 / x1000` presets plus a custom amount. Township's
  also has a **`Max (N)`** option that funds every build remaining until the next upgrade.
- **Township tasks** use `Claim` rather than adding items, because goals like
  *"Defeat 50 Skeletons"* can't be satisfied from the bank. It marks every goal met,
  awards the rewards, and completes the task.

### Item Adder

A settings page with a searchable, category-filtered grid of **every item and currency**
in the game. Select any number of them, set a quantity, and add them straight to your bank.

## Install

**From a modfile:** upload/install `add-shop-items.zip` (contains `manifest.json` +
`setup.mjs` at the archive root).

**As a local mod:** create a local mod in the Melvor Mod Manager and point it at the
`mod/` folder.

Then enable the mod and load a character.

## Using the Item Adder

1. Open the Mod Manager and go to this mod's **Settings**.
2. Click **Open Item Adder**. The settings popup closes and a full-screen grid opens.
3. Search by name and/or filter by category, set the quantity, click items to select them
   (green highlight), then click **Add**. **Clear** deselects everything, and a toast
   confirms what was added.

Large batches are added in throttled chunks so the game stays responsive.

## Development notes

Everything lives in one file, `mod/setup.mjs`. A few hard-won details worth knowing before
changing it:

- **`manifest.json` is the required filename.** A `setup.json` is silently ignored: the
  mod installs and enables fine but never runs.
- **Melvor's globals are lexically scoped**, not on `globalThis`. Reach `game`, `shopMenu`,
  `Swal` etc. by bare name behind a `typeof` guard (see `getGame()`).
- **Custom elements are resolved via `customElements.get(...)`**, which sidesteps the
  scoping problem entirely.
- **Menus are built during load, before `onInterfaceReady`.** Patching a setter like
  `setSelectedRecipe` only catches *changes*, so `sweepExistingMenus()` also injects into
  already-rendered elements.
- **Element pooling is real.** The task/recipe/building elements are reused for different
  subjects, so every button resolves its target at **click** time rather than capturing it.
- **UI refresh has three mechanisms**, because Melvor's `render*` methods early-return
  unless their `renderQueue` flag is set:
  1. flip the boolean `renderQueue` flags (most skills),
  2. add the changed subject to `Set`-shaped queues (township tasks),
  3. replay the original render call with its stashed args (agility cost pills, farming
     "Seeds in Bank").
- The `probes/` directory holds the console scripts used to reverse-engineer each screen's
  object graph at runtime. When adding a new screen, probe first — don't guess.

If a button doesn't appear, open the browser console and look for
`Shop Requirement Filler` messages.
