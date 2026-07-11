// PROBE 6: Cartography tabs 2 & 3 (Dig Site Map Creation / Refinement).
//
// The <create-map-menu> holds paperMakingMenu / mapUpgradeMenu / mapRefinementMenu.
// Tabs 2 and 3 were hidden last run so they never got dumped. This reaches them
// directly off the parent, so you only need the "Create Dig Site Maps" modal OPEN
// (ideally on tab 2, with a dig site selected, so the cost calls resolve).

(() => {
  const lines = [];
  const carto = game.cartography;

  const costs = (v, label) => {
    if (v && typeof v.getItemQuantityArray === "function") {
      lines.push(
        "  " +
          label +
          " -> Costs items=" +
          JSON.stringify(v.getItemQuantityArray().map((e) => [e.item.name, e.quantity])) +
          " curr=" +
          JSON.stringify(v.getCurrencyQuantityArray().map((e) => [e.currency.name, e.quantity])),
      );
    } else {
      lines.push("  " + label + " -> " + (v && v.constructor ? v.constructor.name : typeof v));
      if (v && typeof v === "object") lines.push("    keys = " + Object.keys(v).join(", "));
    }
  };

  const parent = document.querySelector("create-map-menu");
  lines.push("create-map-menu present: " + Boolean(parent));

  for (const key of ["paperMakingMenu", "mapUpgradeMenu", "mapRefinementMenu", "digSiteSelect"]) {
    const el = parent && parent[key];
    lines.push("=== ." + key + " ===");
    if (!el) {
      lines.push("  MISSING");
      continue;
    }
    lines.push("  TAG: <" + el.tagName.toLowerCase() + ">  CTOR: " + el.constructor.name);
    lines.push("  OWN PROPS: " + Object.keys(el).join(", "));
    lines.push("  PROTO: " + Object.getOwnPropertyNames(Object.getPrototypeOf(el)).join(", "));
    // Which props look like a requires-box / create button we can anchor to?
    for (const k of Object.keys(el)) {
      const v = el[k];
      if (v && v.tagName) lines.push("    ." + k + " = <" + v.tagName.toLowerCase() + ">");
    }
  }

  // ---- the cost APIs, with a real dig site / map ----
  lines.push("=== COSTS ===");
  const map = carto.activeMap;
  lines.push("  activeMap = " + (map && map.name));
  const sites = map && (map.sortedDigSites || map.digSites);
  lines.push("  digSites = " + (sites ? sites.length : "none"));

  const site = sites && sites[0];
  if (site) {
    lines.push("  digSite = " + (site.name || site.id));
    lines.push("  digSite keys = " + Object.keys(site).join(", "));
    try {
      costs(carto.getMapCreationCosts(site), "getMapCreationCosts(digSite)");
    } catch (e) {
      lines.push("  getMapCreationCosts ERR: " + e.message);
    }

    const dsMap = site.maps && site.maps[0];
    lines.push("  digSite.maps[0] = " + (dsMap ? dsMap.constructor.name : "none"));
    if (dsMap) {
      lines.push("  map keys = " + Object.keys(dsMap).join(", "));
      try {
        costs(carto.getMapUpgradeCosts(dsMap), "getMapUpgradeCosts(map)");
      } catch (e) {
        lines.push("  getMapUpgradeCosts ERR: " + e.message);
      }
      try {
        costs(carto.getNextRefinementSlotCost(dsMap), "getNextRefinementSlotCost(map)");
      } catch (e) {
        lines.push("  getNextRefinementSlotCost ERR: " + e.message);
      }
    }
  }

  // What's currently selected in the UI?
  for (const k of ["selectedUpgradeDigSite", "selectedUpgradeMap", "selectedPaperRecipe"]) {
    try {
      const v = carto[k];
      lines.push("  carto." + k + " = " + (v ? v.name || v.constructor.name : String(v)));
    } catch (e) {
      lines.push("  carto." + k + " threw: " + e.message);
    }
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
