// PROBE 3: astrology only — the last gap.
//
// probe2 showed getAstroModUpgradeCost(constellation, modifier) RETURNS something,
// but it isn't a Costs object. This finds out what it actually is, and what a
// modifier's `costs` array entries look like (there's one entry per level:
// costs.length === maxCount === 8, so costs[timesBought] is the next level's price).
//
// Run with a CONSTELLATION OPEN (the stardust-button screen).

(() => {
  const lines = [];
  const a = game.astrology;
  const c = a.actions.allObjects[0];
  const mod = c.standardModifiers[0];

  // Print an unknown value without tripping over circular refs.
  const show = (v) => {
    if (v === null || v === undefined) return String(v);
    if (typeof v !== "object") return typeof v + " " + String(v);
    if (v.name) return (v.constructor && v.constructor.name) + " name=" + v.name;
    return (v.constructor && v.constructor.name) || "object";
  };
  const expand = (obj, prefix) => {
    if (!obj || typeof obj !== "object") {
      lines.push(prefix + " = " + show(obj));
      return;
    }
    lines.push(prefix + " ctor = " + ((obj.constructor && obj.constructor.name) || "?"));
    lines.push(prefix + " keys = " + Object.keys(obj).join(", "));
    for (const k of Object.keys(obj)) {
      lines.push(prefix + "." + k + " = " + show(obj[k]));
    }
  };

  lines.push("=== modifier ===");
  lines.push("timesBought = " + mod.timesBought + "   maxCount = " + mod.maxCount);
  lines.push("costs.length = " + mod.costs.length);
  expand(mod.costs[0], "costs[0]");
  expand(mod.costs[1], "costs[1]");

  lines.push("=== getAstroModUpgradeCost(constellation, modifier) ===");
  try {
    expand(a.getAstroModUpgradeCost(c, mod), "result");
  } catch (e) {
    lines.push("ERR: " + e.message);
  }

  lines.push("=== row element <astrology-modifier-display> ===");
  const el = document.querySelector("astrology-modifier-display");
  if (el) {
    lines.push("updateCost.length = " + el.updateCost.length);
    lines.push("setDustQuantity.length = " + el.setDustQuantity.length);
    lines.push("setStandard.length = " + el.setStandard.length);
    lines.push("setModifier.length = " + el.setModifier.length);
    lines.push("upgradeButton = " + (el.upgradeButton ? el.upgradeButton.outerHTML.slice(0, 400) : "MISSING"));
  } else {
    lines.push("no row on screen — open a constellation");
  }

  lines.push("=== panel <astrology-exploration-panel> ===");
  const panel = customElements.get("astrology-exploration-panel");
  if (panel) {
    const p = panel.prototype;
    for (const fn of ["setConstellation", "setUpgradeCosts", "setStandardUpgradeCost", "setStandardModifier"]) {
      lines.push("  " + fn + ".length = " + (typeof p[fn] === "function" ? p[fn].length : "MISSING"));
    }
  }
  const live = document.querySelector("astrology-exploration-panel");
  if (live) {
    lines.push("  standardModifiers count = " + (live.standardModifiers ? live.standardModifiers.length : "?"));
    lines.push("  uniqueModifiers count = " + (live.uniqueModifiers ? live.uniqueModifiers.length : "?"));
    lines.push("  abyssalModifiers count = " + (live.abyssalModifiers ? live.abyssalModifiers.length : "?"));
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
