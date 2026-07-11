// PROBE 9: (a) why the township build button says "Already have all", and
//          (b) the shape of a casual task's GOALS (the "Give 1 Leather Gloves" bit).
//
// Run on the Township TOWN view (buildings visible). The tasks part works from
// anywhere.

(() => {
  const lines = [];
  const t = game.township;

  const entries = (v) => {
    if (Array.isArray(v)) return v;
    if (v instanceof Map) return Array.from(v, ([resource, quantity]) => ({ resource, quantity }));
    return [];
  };
  const printCosts = (v, label) => {
    const list = entries(v);
    lines.push(
      "  " + label + " -> " + (v instanceof Map ? "Map" : Array.isArray(v) ? "Array" : typeof v) +
      " :: " + JSON.stringify(list.map((e) => [e.resource && e.resource.name, e.quantity])),
    );
  };

  // ---------- (a) BUILD COSTS ----------
  lines.push("########## BUILD COSTS ##########");
  lines.push("upgradeQty = " + t.upgradeQty + "  (type " + typeof t.upgradeQty + ")");
  lines.push("currentTownBiome = " + (t.currentTownBiome && t.currentTownBiome.name));

  lines.push("--- current town resources ---");
  t.resources.allObjects.forEach((r) => lines.push("  " + r.name + " = " + r.amount + " / cap " + r.cap));

  const els = document.querySelectorAll("building-in-town");
  lines.push("building-in-town count = " + els.length);

  // Look at the first few that actually show an upgrade/build option.
  let shown = 0;
  els.forEach((el) => {
    if (shown >= 3) return;
    const name = el.buildingName && el.buildingName.textContent.trim();
    const upName = el.upgradesToName && el.upgradesToName.textContent.trim();
    if (!name) return;
    shown += 1;

    lines.push("=== element: buildingName='" + name + "'  upgradesToName='" + upName + "' ===");
    lines.push("  upgradeData = " + (el.upgradeData ? el.upgradeData.constructor.name : el.upgradeData));
    if (el.upgradeData && typeof el.upgradeData === "object") {
      lines.push("    keys = " + Object.keys(el.upgradeData).join(", "));
      for (const k of Object.keys(el.upgradeData)) {
        const v = el.upgradeData[k];
        lines.push("    ." + k + " = " + (v && v.name ? v.name : v));
      }
    }
    lines.push("  upgradesToCosts text = " + (el.upgradesToCosts && el.upgradesToCosts.textContent.replace(/\s+/g, " ").trim().slice(0, 120)));

    const byName = t.buildings.allObjects.find((b) => b.name === name);
    const byUpName = upName && t.buildings.allObjects.find((b) => b.name === upName);
    lines.push("  matched building = " + (byName && byName.name));
    lines.push("  matched upgradesTo = " + (byUpName && byUpName.name));
    lines.push("  building.upgradesTo = " + (byName && byName.upgradesTo && byName.upgradesTo.name));

    if (byName && t.currentTownBiome) {
      try {
        printCosts(t.getBuildingCostsForBiome(byName, t.currentTownBiome), "costs(matched)");
      } catch (e) {
        lines.push("  costs(matched) ERR: " + e.message);
      }
    }
    if (byUpName && t.currentTownBiome) {
      try {
        printCosts(t.getBuildingCostsForBiome(byUpName, t.currentTownBiome), "costs(upgradesTo)");
      } catch (e) {
        lines.push("  costs(upgradesTo) ERR: " + e.message);
      }
    }
  });

  // ---------- (b) TASK GOALS ----------
  lines.push("########## CASUAL TASK GOALS ##########");
  const task = t.casualTasks.currentCasualTasks[0];
  lines.push("task ctor = " + task.constructor.name);
  const goals = task.goals;
  lines.push("goals ctor = " + goals.constructor.name);
  lines.push("goals keys = " + Object.keys(goals).join(", "));
  lines.push("goals PROTO = " + Object.getOwnPropertyNames(Object.getPrototypeOf(goals)).join(", "));

  for (const k of Object.keys(goals)) {
    const v = goals[k];
    if (Array.isArray(v)) {
      lines.push("  goals." + k + " = Array[" + v.length + "]");
      if (v[0] && typeof v[0] === "object") {
        lines.push("    [0] ctor = " + v[0].constructor.name);
        lines.push("    [0] keys = " + Object.keys(v[0]).join(", "));
        for (const kk of Object.keys(v[0])) {
          const x = v[0][kk];
          lines.push("    [0]." + kk + " = " + (x && x.name ? x.name : x));
        }
      }
    } else if (v && typeof v === "object") {
      lines.push("  goals." + k + " = " + (v.name || v.constructor.name));
    } else {
      lines.push("  goals." + k + " = " + v);
    }
  }

  // The element that renders one casual task.
  const taskEl = document.querySelector("township-casual-task");
  if (taskEl) {
    lines.push("casual-task element goals prop = " + (taskEl.goals && taskEl.goals.constructor.name));
    lines.push("  completeButton = " + (taskEl.completeButton && taskEl.completeButton.tagName));
    lines.push("  goalContainer = " + (taskEl.goalContainer && taskEl.goalContainer.tagName));
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
