# Shop Requirement Filler

Melvor Idle mod that adds an `Add items` button to shop purchase or upgrade rows. Clicking the button adds the missing item costs to the player's bank so the purchase can be bought.

## Install

1. Create a local mod in the Melvor Mod Manager.
2. Point it at this folder.
3. Enable the mod and load a character.

The mod only fills item costs. It does not add GP, Slayer Coins, Raid Coins, skill levels, completion requirements, or other non-item requirements.

## Notes

Melvor's shop UI has changed across versions, so the mod uses several runtime probes:

- patches common shop render/update methods when present;
- watches the shop DOM for newly rendered rows;
- reads common shop purchase cost shapes such as `costs.items`, `itemCosts`, and `{ item, quantity }`.

If the button does not appear for a specific shop row, open the browser console and look for `Shop Requirement Filler` messages.
