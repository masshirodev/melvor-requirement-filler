// PROBE: Artisan / "crafting" skill recipe panel
//
// Run this in the browser console with a CRAFTING-STYLE SKILL OPEN and a RECIPE
// SELECTED — the screen showing the "Requires: / You Have:" box.
// (Crafting, Smithing, Fletching, Herblore, Runecrafting, Summoning all qualify;
// they're expected to share one element, but run it on two to confirm.)
//
// If the console refuses to paste, type `allow pasting` (typed, not pasted) + Enter first.
// The result is printed AND copied to your clipboard.

(() => {
  const lines = [];

  // 1. Which custom elements on screen belong to the recipe/requirements UI?
  const tags = new Set();
  document.querySelectorAll("*").forEach((el) => {
    const t = el.tagName.toLowerCase();
    if (!t.includes("-")) return;
    if (
      t.includes("artisan") ||
      t.includes("recipe") ||
      t.includes("quantity") ||
      t.includes("craft") ||
      t.includes("require")
    ) {
      tags.add(t);
    }
  });
  lines.push("TAGS: " + Array.from(tags).join(", "));

  // 2. For each: constructor, props (looking for the Requires/You-Have containers
  //    to anchor the dropdown to), and methods to patch / replay.
  for (const tag of tags) {
    const el = document.querySelector(tag);
    if (!el) continue;
    lines.push("=== " + tag + " ===");
    lines.push("CTOR: " + el.constructor.name);
    lines.push("OWN PROPS: " + Object.keys(el).join(", "));
    lines.push("PROTO: " + Object.getOwnPropertyNames(Object.getPrototypeOf(el)).join(", "));
    lines.push("HTML: " + el.outerHTML.slice(0, 800));
  }

  // 3. Which skills expose recipes + a cost API?
  const skills = game.skills.allObjects.filter(
    (s) => typeof s.getRecipeCosts === "function" || "selectedRecipe" in s,
  );
  lines.push("SKILLS WITH RECIPES: " + skills.map((s) => s.name + " (" + s.constructor.name + ")").join(", "));

  // 4. The currently-open skill's selected recipe + its reduction-aware costs.
  for (const s of skills) {
    const r = s.selectedRecipe;
    if (!r) continue;

    lines.push("=== SKILL " + s.name + " (" + s.constructor.name + ") ===");
    lines.push(
      "METHODS: " +
        Object.getOwnPropertyNames(Object.getPrototypeOf(s))
          .filter((n) => {
            const x = n.toLowerCase();
            return x.includes("recipe") || x.includes("cost") || x.includes("selected");
          })
          .join(", "),
    );
    lines.push("RECIPE: " + (r.name || r.id));
    lines.push("RECIPE KEYS: " + Object.keys(r).join(", "));

    try {
      const c = s.getRecipeCosts(r);
      lines.push("COSTS CTOR: " + c.constructor.name);
      lines.push("COST ITEMS: " + JSON.stringify(c.getItemQuantityArray().map((e) => [e.item.name, e.quantity])));
      lines.push(
        "COST CURR: " + JSON.stringify(c.getCurrencyQuantityArray().map((e) => [e.currency.name, e.quantity])),
      );
    } catch (e) {
      lines.push("COSTS ERR: " + e.message);
    }
    break; // only the open one
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
