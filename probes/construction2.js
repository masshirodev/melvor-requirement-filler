// PROBE: Construction, part 2 — the FIXTURE cost API and the room panel's DOM.
//
// Part 1 found the pieces: skill `rielkConstruction:Construction`, the build UI is
// <rielk-construction-room-panel> (holds .selectedFixture), and the costs live on
// ConstructionFixture: getTotalRemainingCost / getCurrentBuildRecipeCosts / UIcost / stepCost.
// This dumps their SOURCE and their VALUES so the button adds exactly what the card shows.
//
// Run in the game frame's console (context dropdown -> "game (index_game.php)"), with the
// CONSTRUCTION page open and a fixture SELECTED (a card showing Costs Remaining + Build).

(() => {
  const lines = [];
  const add = (...parts) => lines.push(parts.join(""));
  const names = (o) => {
    try {
      return Object.getOwnPropertyNames(Object.getPrototypeOf(o)).join(", ");
    } catch {
      return "-";
    }
  };
  const src = (obj, name, label) => {
    const proto = obj && Object.getPrototypeOf(obj);
    const d = proto && (Object.getOwnPropertyDescriptor(proto, name) || {});
    const fn = d.value || d.get;
    add("----- ", label || name, d.get ? " (getter)" : ` (arity ${fn ? fn.length : "?"})`, " -----");
    add(fn ? fn.toString().slice(0, 1200) : "  MISSING");
  };
  // Costs objects: print what's actually inside, whatever shape they are.
  const dumpCosts = (c, label) => {
    add("  ", label, ": ", c === undefined ? "undefined" : c === null ? "null" : c.constructor.name);
    if (!c || typeof c !== "object") return;
    try {
      if (typeof c.getItemQuantityArray === "function") {
        add("    items: ", JSON.stringify(c.getItemQuantityArray().map((e) => [e.item.name, e.quantity])));
        add("    curr:  ", JSON.stringify(c.getCurrencyQuantityArray().map((e) => [e.currency.name, e.quantity])));
      } else {
        add("    PROTO: ", names(c));
        add("    KEYS: ", Object.keys(c).join(", "));
        if (c._items instanceof Map)
          add("    _items: ", JSON.stringify(Array.from(c._items, ([k, v]) => [k.name || k.id, v])));
        if (c._currencies instanceof Map)
          add("    _currencies: ", JSON.stringify(Array.from(c._currencies, ([k, v]) => [k.name || k.id, v])));
      }
      if (typeof c.checkIfOwned === "function") add("    checkIfOwned(): ", c.checkIfOwned());
    } catch (e) {
      add("    ERR: ", e.message);
    }
  };

  const skill = game.skills.allObjects.find((s) => s.id === "rielkConstruction:Construction");
  if (!skill) return "Construction skill not found — are you in the game frame?";

  // 1. Does the Materials (crafting) side already work? patchArtisanMenus needs
  //    getCurrentRecipeCosts anywhere on the chain + a menu whose tag contains "artisan-menu".
  add("=== MATERIALS / ARTISAN SIDE ===");
  add("getCurrentRecipeCosts: ", typeof skill.getCurrentRecipeCosts);
  let chain = Object.getPrototypeOf(skill);
  const chainNames = [];
  while (chain && chain.constructor !== Object) {
    chainNames.push(chain.constructor.name);
    chain = Object.getPrototypeOf(chain);
  }
  add("PROTO CHAIN: ", chainNames.join(" -> "));
  try {
    const menu = skill.menu;
    add("menu tag: ", menu.tagName.toLowerCase(), "  has .requires: ", Boolean(menu.requires));
    add("menu OWN PROPS: ", Object.keys(menu).join(", "));
    if (typeof skill.getCurrentRecipeCosts === "function") dumpCosts(skill.getCurrentRecipeCosts(), "getCurrentRecipeCosts()");
  } catch (e) {
    add("menu ERR: ", e.message);
  }

  // 2. The fixture: THE cost API for building.
  const fixture = skill.fixtures.allObjects[0];
  add("=== ConstructionFixture (source) ===");
  for (const n of [
    "getTotalRemainingCost",
    "getCurrentBuildRecipeCosts",
    "currentRecipe",
    "getRecipe",
    "percentProgress",
    "upgrade",
    "tierUp",
    "isMaxTier",
    "maxTier",
  ]) {
    src(fixture, n);
  }

  // 3. A LIVE fixture with progress on it — prefer the one the panel is showing.
  const panels = Array.from(document.querySelectorAll("rielk-construction-room-panel"));
  const shown = panels.map((p) => p.selectedFixture).filter(Boolean);
  const live = shown[0] || skill.selectedFixture || fixture;
  add("=== LIVE FIXTURE: ", live.name, " ===");
  add("  room: ", live.room && live.room.name, "  currentTier: ", live.currentTier, "  progress: ", live.progress);
  add("  isMaxTier: ", live.isMaxTier, "  percentProgress: ", live.percentProgress);
  add("  KEYS: ", Object.keys(live).join(", "));
  try {
    add("  currentRecipe: ", live.currentRecipe && live.currentRecipe.name);
  } catch (e) {
    add("  currentRecipe THROWS: ", e.message);
  }
  dumpCosts(live.UIcost, "fixture.UIcost");
  dumpCosts(live.stepCost, "fixture.stepCost");

  // Call the two cost getters with plausible args and show what each returns.
  add("=== CALLING THE COST GETTERS ===");
  for (const [label, call] of [
    ["getTotalRemainingCost()", () => live.getTotalRemainingCost()],
    ["getTotalRemainingCost(skill)", () => live.getTotalRemainingCost(skill)],
    ["getCurrentBuildRecipeCosts(skill)", () => live.getCurrentBuildRecipeCosts(skill)],
    ["getCurrentBuildRecipeCosts(skill,false)", () => live.getCurrentBuildRecipeCosts(skill, false)],
  ]) {
    try {
      const r = call();
      dumpCosts(r, label + " ->");
    } catch (e) {
      add("  ", label, " ERR: ", e.message);
    }
  }
  // These may mutate stepCost as a side effect — show it after.
  dumpCosts(live.stepCost, "fixture.stepCost AFTER the calls");

  // 4. The panel's DOM: where does the button go, and what rebuilds that box?
  add("=== ROOM PANEL ===");
  const panel = panels.find((p) => p.selectedFixture) || panels[0];
  if (panel) {
    add("panels: ", panels.length, "  showing a fixture: ", shown.length);
    add("selectedFixture: ", panel.selectedFixture && panel.selectedFixture.name);
    for (const key of [
      "requires",
      "haves",
      "grants",
      "ingredientsContainer",
      "grantsContainer",
      "buildContainer",
      "startButton",
      "upgradesButton",
      "builtProgressText",
      "progressBar",
    ]) {
      const el = panel[key];
      add(
        "  ",
        key,
        ": ",
        el && el.tagName ? `<${el.tagName.toLowerCase()} class="${el.className}"> children=${el.children.length}` : String(el),
      );
      if (el && el.tagName) add("      HTML: ", el.outerHTML.replace(/\s+/g, " ").slice(0, 220));
    }
    add("--- methods that (re)build the cost box — our button must survive these ---");
    for (const n of [
      "selectFixture",
      "selectFixtureUI",
      "updateFixtureInfo",
      "updateFixtureItemIcons",
      "updateCurrentFixtureItemIcons",
      "addTotalCostsToRemaining",
      "setRoom",
    ]) {
      src(panel, n);
    }
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
