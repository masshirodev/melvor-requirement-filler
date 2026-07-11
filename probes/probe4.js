// PROBE 4: the remaining cost-bearing screens.
//   - Cartography "Create Dig Site Maps" (Create Paper / Map Creation / Refinement)
//   - Cooking (fire / furnace / pot)
//   - Firemaking (burn logs + oil)
//   - Farming (Plant a Seed)
//
// RUN IT ONCE PER SCREEN, with that screen OPEN. It only dumps custom elements that
// are actually VISIBLE, so each run captures just the screen you're looking at.
// Send me the output from each run (say which screen it was).
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
      return "(not a Costs: " + (c && c.constructor && c.constructor.name) + ") " + e.message;
    }
  };

  // ---------- visible custom elements on the open screen ----------
  lines.push("########## VISIBLE CUSTOM ELEMENTS ##########");
  const seen = new Set();
  document.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (!tag.includes("-")) return;
    if (seen.has(tag)) return;
    if (el.offsetParent === null) return; // not visible → not the open screen
    seen.add(tag);

    lines.push("=== <" + tag + "> " + el.constructor.name + " ===");
    lines.push("  OWN PROPS: " + Object.keys(el).join(", "));
    lines.push("  PROTO: " + Object.getOwnPropertyNames(Object.getPrototypeOf(el)).join(", "));
    // Anything that looks like a cost/requirement container we could anchor to:
    for (const k of Object.keys(el)) {
      const v = el[k];
      if (v && v.tagName && /require|have|cost|quantity|create|button/i.test(k)) {
        lines.push("  ANCHOR? ." + k + " = <" + v.tagName.toLowerCase() + ">");
      }
    }
  });

  // ---------- the four skills' cost APIs ----------
  lines.push("########## SKILL APIS ##########");
  for (const key of ["cooking", "firemaking", "farming", "cartography"]) {
    const s = g[key];
    if (!s) {
      lines.push("=== " + key + ": MISSING on game ===");
      continue;
    }
    lines.push("=== " + key + " (" + s.constructor.name + ") ===");
    lines.push("  PROTO: " + Object.getOwnPropertyNames(Object.getPrototypeOf(s)).join(", "));
    lines.push("  OWN KEYS: " + Object.keys(s).join(", "));

    // Cooking keeps one selected recipe PER CATEGORY.
    if (s.selectedRecipes) {
      try {
        lines.push("  selectedRecipes size = " + s.selectedRecipes.size);
        s.selectedRecipes.forEach((recipe, category) => {
          const cat = (category && (category.name || category.localID)) || "?";
          lines.push("    [" + cat + "] -> " + (recipe && recipe.name));
          if (typeof s.getRecipeCosts === "function") {
            try {
              lines.push("       getRecipeCosts -> " + describeCosts(s.getRecipeCosts(recipe)));
            } catch (e) {
              lines.push("       getRecipeCosts ERR: " + e.message);
            }
          }
        });
      } catch (e) {
        lines.push("  selectedRecipes ERR: " + e.message);
      }
    }

    // Single-selection skills (Firemaking).
    for (const prop of ["selectedRecipe", "selectedOil"]) {
      try {
        const v = s[prop];
        if (v) lines.push("  " + prop + " = " + (v.name || v.id));
      } catch (e) {
        lines.push("  " + prop + " threw: " + e.message);
      }
    }
    if (typeof s.getCurrentRecipeCosts === "function") {
      try {
        lines.push("  getCurrentRecipeCosts() -> " + describeCosts(s.getCurrentRecipeCosts()));
      } catch (e) {
        lines.push("  getCurrentRecipeCosts() ERR: " + e.message);
      }
    }

    // Arity of the cost helpers so I know how to call them.
    for (const fn of Object.getOwnPropertyNames(Object.getPrototypeOf(s))) {
      if (!/cost/i.test(fn)) continue;
      try {
        if (typeof s[fn] === "function") lines.push("  " + fn + ".length = " + s[fn].length);
      } catch (e) {
        /* getter, skip */
      }
    }
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
