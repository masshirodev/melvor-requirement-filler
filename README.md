# Shop Requirement Filler

Melvor Idle mod with two features:

1. **Cost filler** — adds an `Add items` button to shop purchase/upgrade rows and to
   Agility obstacle/pillar build cards. Clicking it tops up the missing **item and
   currency** costs of that purchase or build in your bank so it becomes affordable.
   Agility build costs are read through `getObstacleBuildCosts` / `getPillarBuildCosts`,
   so cost-reduction modifiers are respected.
2. **Item Adder** — a settings page with a searchable, category-filterable grid of
   every item (and currency) in the game. Select any number of them, set a
   quantity, and add them straight to your bank.

## Install

1. Create a local mod in the Melvor Mod Manager and point it at the `mod/` folder
   (or upload `add-shop-items.zip` to mod.io).
2. Enable the mod and load a character.

## Using the Item Adder

1. Open the Mod Manager and go to this mod's **Settings**.
2. Click **Open Item Adder**. The settings popup closes and a full-screen grid
   opens.
3. Search by name and/or filter by category, set the quantity, click items to
   select them (green highlight), then click **Add**. **Clear** deselects
   everything. A toast confirms what was added.

Large batches are added in throttled chunks so the game stays responsive.

## Notes

- The shop filler only fills item and currency costs. It does not add skill levels,
  completion requirements, or other non-cost requirements.
- Globals (`game`, `shopMenu`, `Swal`, `formatNumber`) are reached by bare name with
  `typeof` guards, since Melvor scopes them lexically rather than on `globalThis`.
- If a shop button doesn't appear, open the browser console and look for
  `Shop Requirement Filler` messages.
