// PROBE 2: closes the two gaps left by probes 1.
//
// Gap A: the artisan skills' real cost method. Probe 1 stopped at Firemaking, which
//        has a selectedRecipe but uses getCurrentRecipeCosts() instead of
//        getRecipeCosts(recipe). This enumerates EVERY skill without breaking.
// Gap B: the signature of game.astrology.getAstroModUpgradeCost, and the shape of a
//        modifier's `costs`.
//
// Run it with an ARTISAN SKILL OPEN AND A RECIPE SELECTED (Smithing/Crafting/etc.) —
// astrology doesn't need to be on screen for its part.
//
// If the console refuses to paste, type `allow pasting` (typed, not pasted) + Enter first.

(() => {
  const lines = [];
  const g = game;

  const describeCosts = (c) => {
    try {
      return (
        c.constructor.name +
        " items=" +
        JSON.stringify(c.getItemQuantityArray().map((e) => [e.item.name, e.quantity])) +
        " curr=" +
        JSON.stringify(c.getCurrencyQuantityArray().map((e) => [e.currency.name, e.quantity]))
      );
    } catch (e) {
      return "(not a Costs) " + e.message;
    }
  };

  // ---------- Gap A: every skill that has recipes/costs ----------
  lines.push("########## SKILLS ##########");
  for (const s of g.skills.allObjects) {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(s));
    const costish = methods.filter((n) => {
      const x = n.toLowerCase();
      return x.includes("cost") || x.includes("recipe") || x.includes("menu");
    });
    if (costish.length === 0) continue;

    lines.push("=== " + s.name + " (" + s.constructor.name + ") ===");
    lines.push("  METHODS: " + costish.join(", "));
    lines.push(
      "  OWN KEYS: " +
        Object.keys(s)
          .filter((k) => {
            const x = k.toLowerCase();
            return x.includes("menu") || x.includes("selected") || x.includes("recipe");
          })
          .join(", "),
    );

    // Both are getters and some (Cooking) THROW when nothing is selected.
    let r = null;
    for (const prop of ["selectedRecipe", "activeRecipe"]) {
      try {
        r = s[prop];
      } catch (e) {
        lines.push("  " + prop + " threw: " + e.message);
        continue;
      }
      if (r) break;
    }
    lines.push("  SELECTED RECIPE: " + (r ? r.name || r.id : "none"));
    if (!r) continue;

    lines.push("  RECIPE KEYS: " + Object.keys(r).join(", "));

    if (typeof s.getRecipeCosts === "function") {
      try {
        lines.push("  getRecipeCosts(recipe) -> " + describeCosts(s.getRecipeCosts(r)));
      } catch (e) {
        lines.push("  getRecipeCosts(recipe) ERR: " + e.message);
      }
    }
    if (typeof s.getCurrentRecipeCosts === "function") {
      try {
        lines.push("  getCurrentRecipeCosts() -> " + describeCosts(s.getCurrentRecipeCosts()));
      } catch (e) {
        lines.push("  getCurrentRecipeCosts() ERR: " + e.message);
      }
    }
  }

  // ---------- The artisan menu elements in the DOM ----------
  lines.push("########## ARTISAN MENU ELEMENTS ##########");
  document.querySelectorAll("artisan-menu, herblore-artisan-menu").forEach((el) => {
    lines.push(
      "  id=" +
        el.id +
        " ctor=" +
        el.constructor.name +
        " requires=" +
        (el.requires && el.requires.tagName) +
        " haves=" +
        (el.haves && el.haves.tagName) +
        " createButton=" +
        (el.createButton && el.createButton.tagName) +
        " updateQuantities.length=" +
        (el.updateQuantities ? el.updateQuantities.length : "n/a") +
        " setIngredients.length=" +
        (el.setIngredients ? el.setIngredients.length : "n/a"),
    );
  });

  // ---------- Gap B: astrology cost API ----------
  lines.push("########## ASTROLOGY ##########");
  const a = g.astrology;
  for (const fn of [
    "getAstroModUpgradeCost",
    "checkAndConsumeAstroModCosts",
    "upgradeStandardModifier",
    "renderUpgradeCosts",
    "renderStardustQuantities",
    "queueModifierRender",
  ]) {
    lines.push("  " + fn + ".length = " + (typeof a[fn] === "function" ? a[fn].length : "MISSING"));
  }

  const c = a.actions.allObjects[0];
  const mod = c.standardModifiers[0];
  lines.push("  constellation: " + c.name);
  lines.push("  modifier.timesBought=" + mod.timesBought + " maxCount=" + mod.maxCount);
  try {
    lines.push("  modifier.costs ctor = " + (mod.costs && mod.costs.constructor.name));
    lines.push("  modifier.costs = " + JSON.stringify(mod.costs));
  } catch (e) {
    lines.push("  modifier.costs (circular) keys = " + Object.keys(mod.costs || {}).join(", "));
  }

  // Try the plausible call shapes and see which one yields a Costs.
  const attempts = [
    ["(mod)", [mod]],
    ["(constellation, mod)", [c, mod]],
    ["(mod, 0)", [mod, 0]],
    ["(constellation, 0)", [c, 0]],
  ];
  for (const [label, args] of attempts) {
    try {
      const res = a.getAstroModUpgradeCost(...args);
      lines.push("  getAstroModUpgradeCost" + label + " -> " + describeCosts(res));
    } catch (e) {
      lines.push("  getAstroModUpgradeCost" + label + " ERR: " + e.message);
    }
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
