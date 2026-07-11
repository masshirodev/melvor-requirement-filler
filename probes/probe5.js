// PROBE 5: return shapes of the remaining cost APIs.
//
// Can be run from ANY screen — it's all game-object introspection.
// (Township needs a built town; if you have none, its section will just say so.)

(() => {
  const lines = [];
  const g = game;

  const show = (v) => {
    if (v === null || v === undefined) return String(v);
    if (typeof v !== "object") return typeof v + " " + String(v);
    if (v.name) return (v.constructor && v.constructor.name) + " name=" + v.name;
    return (v.constructor && v.constructor.name) || "object";
  };

  // Is it a Costs? If so print it. Otherwise describe whatever it is.
  const describe = (v, label) => {
    if (v && typeof v.getItemQuantityArray === "function") {
      try {
        lines.push(
          "  " +
            label +
            " -> Costs items=" +
            JSON.stringify(v.getItemQuantityArray().map((e) => [e.item.name, e.quantity])) +
            " curr=" +
            JSON.stringify(v.getCurrencyQuantityArray().map((e) => [e.currency.name, e.quantity])),
        );
      } catch (e) {
        lines.push("  " + label + " -> Costs but read failed: " + e.message);
      }
      return;
    }
    lines.push("  " + label + " -> " + show(v));
    if (v && typeof v === "object") {
      lines.push("    keys = " + Object.keys(v).join(", "));
      for (const k of Object.keys(v).slice(0, 12)) lines.push("    ." + k + " = " + show(v[k]));
      if (Array.isArray(v) && v[0]) {
        lines.push("    [0] keys = " + Object.keys(v[0]).join(", "));
        for (const k of Object.keys(v[0])) lines.push("    [0]." + k + " = " + show(v[0][k]));
      }
    }
  };

  // ---------- CARTOGRAPHY ----------
  lines.push("########## CARTOGRAPHY ##########");
  const carto = g.cartography;
  if (carto) {
    const paper = carto.selectedPaperRecipe;
    lines.push("  selectedPaperRecipe = " + show(paper));
    if (paper) {
      lines.push("  paperRecipe keys = " + Object.keys(paper).join(", "));
      try {
        describe(carto.getPaperMakingCosts(paper), "getPaperMakingCosts(recipe)");
      } catch (e) {
        lines.push("  getPaperMakingCosts ERR: " + e.message);
      }
    }
    // Map creation takes a dig site.
    try {
      const site = carto.activeMap && carto.activeMap.sortedDigSites && carto.activeMap.sortedDigSites[0];
      lines.push("  digSite sample = " + show(site));
      if (site) describe(carto.getMapCreationCosts(site), "getMapCreationCosts(digSite)");
    } catch (e) {
      lines.push("  getMapCreationCosts ERR: " + e.message);
    }
  }

  // ---------- FARMING ----------
  lines.push("########## FARMING ##########");
  const farm = g.farming;
  if (farm) {
    const recipe = farm.actions.allObjects[0];
    lines.push("  recipe = " + show(recipe));
    lines.push("  recipe keys = " + Object.keys(recipe).join(", "));
    try {
      describe(farm.getRecipeSeedCost(recipe), "getRecipeSeedCost(recipe)");
    } catch (e) {
      lines.push("  getRecipeSeedCost ERR: " + e.message);
    }
    try {
      const plot = farm.plots && farm.plots.find((p) => !p.isUnlocked);
      lines.push("  locked plot = " + show(plot));
      if (plot) describe(farm.getPlotUnlockCosts(plot), "getPlotUnlockCosts(plot)");
    } catch (e) {
      lines.push("  getPlotUnlockCosts ERR: " + e.message);
    }
  }

  // ---------- FIREMAKING (oil) ----------
  lines.push("########## FIREMAKING OIL ##########");
  const fm = g.firemaking;
  if (fm) {
    lines.push("  selectedOil = " + show(fm.selectedOil));
    const r = fm.selectedRecipe;
    if (r) {
      lines.push("  recipe.oilCost = " + show(r.oilCost));
      lines.push("  recipe.oilItems = " + show(r.oilItems));
      if (Array.isArray(r.oilItems) && r.oilItems[0]) {
        lines.push("    oilItems[0] keys = " + Object.keys(r.oilItems[0]).join(", "));
        for (const k of Object.keys(r.oilItems[0])) lines.push("    oilItems[0]." + k + " = " + show(r.oilItems[0][k]));
      }
      if (r.oilCost && typeof r.oilCost === "object") {
        lines.push("    oilCost keys = " + Object.keys(r.oilCost).join(", "));
        for (const k of Object.keys(r.oilCost)) lines.push("    oilCost." + k + " = " + show(r.oilCost[k]));
      }
    }
  }

  // ---------- TOWNSHIP ----------
  lines.push("########## TOWNSHIP ##########");
  const t = g.township;
  if (t) {
    lines.push("  OWN KEYS: " + Object.keys(t).join(", "));
    const res = t.resources && t.resources.allObjects;
    if (res) {
      lines.push("  resources = " + res.map((r) => r.name).join(", "));
      const r0 = res[0];
      lines.push("  resource[0] ctor = " + r0.constructor.name);
      lines.push("  resource[0] keys = " + Object.keys(r0).join(", "));
      lines.push(
        "  resource[0] PROTO = " + Object.getOwnPropertyNames(Object.getPrototypeOf(r0)).join(", "),
      );
      lines.push("  resource[0].amount = " + r0.amount);
    }
    // How are building costs expressed?
    try {
      const building = t.buildings.allObjects[0];
      const biome = t.biomes.allObjects[0];
      lines.push("  building = " + show(building) + "  biome = " + show(biome));
      lines.push("  building keys = " + Object.keys(building).join(", "));
      describe(t.getBuildingCostsForBiome(building, biome), "getBuildingCostsForBiome(building, biome)");
      lines.push("  getBuildingCostsForBiome.length = " + t.getBuildingCostsForBiome.length);
    } catch (e) {
      lines.push("  getBuildingCostsForBiome ERR: " + e.message);
    }
    for (const fn of ["getTotalRepairCosts", "subtractBuildingCosts", "getRepairCostInBiomeForBuilding"]) {
      if (typeof t[fn] === "function") lines.push("  " + fn + ".length = " + t[fn].length);
    }
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
