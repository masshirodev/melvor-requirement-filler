// PROBE 10: township build costs — but ONLY for the buildings you can actually SEE.
//
// probe9 sampled hidden elements (there are 108) and they all priced out to [].
// This filters to visible ones and, for each, compares:
//   - what the DOM shows as the cost
//   - building.costs (the raw data on the building)
//   - getBuildingCostsForBiome(building, currentTownBiome)
//
// Run on the Township TOWN view, ideally scrolled to a building you CAN'T afford
// (the one where the button said "Already have all").

(() => {
  const lines = [];
  const t = game.township;
  const biome = t.currentTownBiome;

  const entries = (v) => {
    if (Array.isArray(v)) return v;
    if (v instanceof Map) return Array.from(v, ([resource, quantity]) => ({ resource, quantity }));
    return [];
  };
  const fmt = (v) =>
    JSON.stringify(entries(v).map((e) => [(e.resource && e.resource.name) || (e.item && e.item.name), e.quantity]));

  lines.push("biome = " + (biome && biome.name) + "   upgradeQty = " + t.upgradeQty);

  let shown = 0;
  document.querySelectorAll("building-in-town").forEach((el) => {
    if (el.offsetParent === null) return; // hidden
    if (shown >= 6) return;
    shown += 1;

    const name = el.buildingName && el.buildingName.textContent.trim();
    lines.push("=== VISIBLE: " + name + " ===");
    lines.push("  upgradesToName = " + (el.upgradesToName && el.upgradesToName.textContent.trim()));
    lines.push(
      "  DOM cost text = '" +
        (el.upgradesToCosts ? el.upgradesToCosts.textContent.replace(/\s+/g, " ").trim() : "?") +
        "'",
    );
    lines.push("  upgradeButton hidden = " + (el.upgradeButton ? el.upgradeButton.offsetParent === null : "?"));

    const b = t.buildings.allObjects.find((x) => x.name === name);
    if (!b) {
      lines.push("  !! no building matched by name");
      return;
    }
    lines.push("  building.costs raw = " + (b.costs && b.costs.constructor.name));
    try {
      // building.costs may be keyed per biome.
      if (Array.isArray(b.costs)) {
        lines.push("    costs[] = " + fmt(b.costs));
        if (b.costs[0]) lines.push("    costs[0] keys = " + Object.keys(b.costs[0]).join(", "));
      } else if (b.costs instanceof Map) {
        lines.push("    costs Map size = " + b.costs.size);
        b.costs.forEach((v, k) => {
          lines.push("      [" + (k && k.name) + "] = " + fmt(v));
        });
      }
    } catch (e) {
      lines.push("    raw costs ERR: " + e.message);
    }

    try {
      lines.push("  getBuildingCostsForBiome(b, biome) = " + fmt(t.getBuildingCostsForBiome(b, biome)));
    } catch (e) {
      lines.push("  getBuildingCostsForBiome ERR: " + e.message);
    }
    try {
      lines.push("  canAffordBuilding = " + t.canAffordBuilding(b));
    } catch (e) {
      lines.push("  canAffordBuilding ERR: " + e.message);
    }
    try {
      lines.push("  getMaxAffordableBuildingQty = " + t.getMaxAffordableBuildingQty(b));
    } catch (e) {
      lines.push("  getMaxAffordableBuildingQty ERR: " + e.message);
    }
    lines.push("  isBuildingAvailable = " + (t.isBuildingAvailable ? t.isBuildingAvailable(b) : "?"));
    lines.push("  building.biomes = " + (b.biomes ? b.biomes.map((x) => x.name).join(", ") : "?"));
  });

  if (shown === 0) lines.push("NO VISIBLE building-in-town — open the Town view first.");

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
