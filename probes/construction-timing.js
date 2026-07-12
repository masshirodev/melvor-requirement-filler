// PROBE: where does the Construction "Add items" click actually spend its time?
//
// Run in the game frame with a fixture selected. Adds ONE item of the fixture's cost and
// times each stage, so we can tell whether the stall is bank.addItem (i.e. other mods
// reacting to the bank event), the cost lookup, or the panel repaint.

(() => {
  const lines = [];
  const time = (label, fn) => {
    const t0 = performance.now();
    let result;
    try {
      result = fn();
    } catch (e) {
      lines.push(`${label}: THREW ${e.message}`);
      return undefined;
    }
    lines.push(`${label}: ${(performance.now() - t0).toFixed(1)} ms`);
    return result;
  };

  const construction = game.skills.allObjects.find((s) => s.id === "rielkConstruction:Construction");
  const panel = Array.from(document.querySelectorAll("rielk-construction-room-panel")).find(
    (p) => p.selectedFixture,
  );
  if (!construction || !panel) return "Open Construction and select a fixture first.";
  const fixture = panel.selectedFixture;

  const costs = time("getTotalRemainingCost()", () => fixture.getTotalRemainingCost());
  const items = costs.getItemQuantityArray();
  lines.push(`cost types: ${items.length} -> ${items.map((e) => `${e.item.name} x${e.quantity}`).join(", ")}`);

  // One addItem of ONE item, so any stall here is per-call overhead (bank event handlers),
  // not the quantity.
  const item = items[0].item;
  time("bank.addItem(x1, notify:false)", () => game.bank.addItem(item, 1, false, false, true, false));
  time("bank.addItem(x1, notify:TRUE)", () => game.bank.addItem(item, 1, false, false, true, true));
  time("bank.addItem(x100000, notify:false)", () => game.bank.addItem(item, 100000, false, false, true, false));

  time("panel.updateCurrentFixtureItemIcons", () =>
    panel.updateCurrentFixtureItemIcons(construction, fixture),
  );

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
