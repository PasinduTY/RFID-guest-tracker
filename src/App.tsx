import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { UpdateBanner } from "./components/UpdateBanner";
import { localDate } from "./lib/dates";
import {
  getActiveList,
  getSetting,
  isMeal,
  setSetting,
  type Meal,
} from "./lib/db";
import { autoExportMeal } from "./lib/exportLog";
import { ImportScreen } from "./screens/ImportScreen";
import { LogScreen } from "./screens/LogScreen";
import { ScanScreen } from "./screens/ScanScreen";

type Screen = "import" | "scan" | "log";
const SCREENS: [Screen, string][] = [
  ["import", "Import"],
  ["scan", "Scan"],
  ["log", "Log"],
];

export default function App() {
  const [screen, setScreen] = useState<Screen | null>(null);
  // Breakfast and dinner each have their own uploaded list.
  const lists = useLiveQuery(async () => ({
    breakfast: (await getActiveList("breakfast")) ?? null,
    dinner: (await getActiveList("dinner")) ?? null,
  }));
  const storedMeal = useLiveQuery(() => getSetting<Meal>("meal"));
  const meal: Meal = isMeal(storedMeal) ? storedMeal : "breakfast";
  const activeList = lists?.[meal] ?? lists?.breakfast ?? lists?.dinner;

  useEffect(() => {
    // Ask the browser not to clear this app's data when disk space runs low.
    navigator.storage?.persist?.();
  }, []);

  // Open on Scan once a list exists, otherwise on Import.
  const current =
    screen ?? (lists === undefined ? null : activeList ? "scan" : "import");

  async function changeMeal(next: Meal) {
    if (next === meal) return;
    await setSetting("meal", next);
    await autoExportMeal(localDate(), meal);
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            ●
          </span>{" "}
          Meal access
          {activeList?.property && (
            <span className="brand-sub">{activeList.property}</span>
          )}
        </span>
        <nav className="tabs">
          {SCREENS.map(([id, label]) => (
            <button
              key={id}
              className={current === id ? "tab on" : "tab"}
              onClick={() => setScreen(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <UpdateBanner />
      <main className="content">
        {current === "import" && lists && (
          // Stay on Import after loading one list, so the other meal's list can be loaded too.
          <ImportScreen lists={lists} onLoaded={() => setScreen("import")} />
        )}
        {current === "scan" && (
          <ScanScreen
            list={lists?.[meal] ?? null}
            meal={meal}
            onMealChange={changeMeal}
            onImport={() => setScreen("import")}
          />
        )}
        {current === "log" && <LogScreen />}
      </main>
    </div>
  );
}
