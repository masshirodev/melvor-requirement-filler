// PROBE 7: Township — buildings (why no button), repair costs, and Tasks.
//
// Run it TWICE:
//   1) with the Township TOWN view open (buildings visible)
//   2) with the Township TASKS view open (the "Give X to your Town" list)
// Label which is which.

(() => {
  const lines = [];
  const t = game.township;

  const costs = (v, label) => {
    if (v && typeof v.getItemQuantityArray === "function") {
      lines.push("  " + label + " -> Costs items=" +
        JSON.stringify(v.getItemQuantityArray().map((e) => [e.item.name, e.quantity])));
      return;
    }
    if (Array.isArray(v)) {
      lines.push("  " + label + " -> Array[" + v.length + "]");
      if (v[0]) {
        lines.push("    [0] keys = " + Object.keys(v[0]).join(", "));
        for (const k of Object.keys(v[0])) {
          const x = v[0][k];
          lines.push("    [0]." + k + " = " + (x && x.name ? x.name : x));
        }
      }
      return;
    }
    lines.push("  " + label + " -> " + (v && v.constructor ? v.constructor.name : typeof v));
    if (v && typeof v === "object") lines.push("    keys = " + Object.keys(v).join(", "));
  };

  // ---- 1. Township render + repair API ----
  lines.push("########## TOWNSHIP SKILL ##########");
  lines.push("PROTO: " + Object.getOwnPropertyNames(Object.getPrototypeOf(t)).join(", "));
  lines.push("renderQueue keys = " + Object.keys(t.renderQueue || {}).join(", "));
  lines.push("currentTownBiome = " + (t.currentTownBiome && t.currentTownBiome.name));

  for (const fn of ["getRepairCostInBiomeForBuilding", "getTotalRepairCosts", "getSingleResourceRepairCostForBuilding", "getBuildingCostsForBiome"]) {
    if (typeof t[fn] === "function") lines.push(fn + ".length = " + t[fn].length);
  }
  try {
    costs(t.getTotalRepairCosts(), "getTotalRepairCosts()");
  } catch (e) {
    lines.push("  getTotalRepairCosts ERR: " + e.message);
  }

  // ---- 2. A live <building-in-town>: does it remember its building? ----
  lines.push("########## <building-in-town> LIVE ##########");
  const el = document.querySelector("building-in-town");
  if (!el) {
    lines.push("  none on screen (open the Town view)");
  } else {
    for (const k of Object.keys(el)) {
      const v = el[k];
      if (v && typeof v === "object" && !v.tagName && v.constructor) {
        lines.push("  ." + k + " = " + v.constructor.name + (v.name ? " name=" + v.name : ""));
      }
    }
    lines.push("  buildingName text = " + (el.buildingName && el.buildingName.textContent));
    lines.push("  setBuilding.length = " + el.setBuilding.length);
    // Try to repair-cost the building it shows, if we can identify it.
    const named = t.buildings.allObjects.find(
      (b) => el.buildingName && b.name === el.buildingName.textContent.trim(),
    );
    lines.push("  matched building by name = " + (named && named.name));
    if (named && t.currentTownBiome) {
      try {
        costs(t.getRepairCostInBiomeForBuilding(named, t.currentTownBiome, 1), "getRepairCostInBiomeForBuilding(b, biome, 1)");
      } catch (e) {
        lines.push("  getRepairCostInBiomeForBuilding ERR: " + e.message);
      }
    }
  }

  // ---- 3. TASKS ----
  lines.push("########## TASKS ##########");
  lines.push("tasks ctor = " + (t.tasks && t.tasks.constructor.name));
  lines.push("tasks keys = " + Object.keys(t.tasks || {}).join(", "));
  lines.push("casualTasks ctor = " + (t.casualTasks && t.casualTasks.constructor.name));
  lines.push("casualTasks keys = " + Object.keys(t.casualTasks || {}).join(", "));

  // The task UI element(s) currently visible.
  const seen = new Set();
  document.querySelectorAll("*").forEach((e) => {
    const tag = e.tagName.toLowerCase();
    if (!tag.includes("-") || seen.has(tag)) return;
    if (!tag.includes("task")) return;
    if (e.offsetParent === null) return;
    seen.add(tag);
    lines.push("=== <" + tag + "> " + e.constructor.name + " ===");
    lines.push("  OWN PROPS: " + Object.keys(e).join(", "));
    lines.push("  PROTO: " + Object.getOwnPropertyNames(Object.getPrototypeOf(e)).join(", "));
  });

  // A task object: what are its goals/requirements?
  const pool = (t.casualTasks && (t.casualTasks.tasks || t.casualTasks.activeTasks)) || null;
  const list = Array.isArray(pool) ? pool : pool && pool.allObjects;
  const task = list && list[0];
  if (task) {
    lines.push("task ctor = " + task.constructor.name);
    lines.push("task keys = " + Object.keys(task).join(", "));
    for (const k of Object.keys(task)) {
      const v = task[k];
      if (Array.isArray(v) && v[0] && typeof v[0] === "object") {
        lines.push("  ." + k + "[0] keys = " + Object.keys(v[0]).join(", "));
        for (const kk of Object.keys(v[0])) {
          const x = v[0][kk];
          lines.push("    ." + k + "[0]." + kk + " = " + (x && x.name ? x.name : x));
        }
      }
    }
  } else {
    lines.push("no task object found — check casualTasks/tasks shape above");
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
