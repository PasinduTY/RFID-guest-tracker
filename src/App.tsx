import { useLiveQuery } from "dexie-react-hooks";
import {
  ListChecks,
  ScanLine,
  Upload,
  Utensils,
  type LucideIcon,
} from "lucide-react";
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
const SCREENS: [Screen, string, LucideIcon][] = [
  ["import", "Import", Upload],
  ["scan", "Scan", ScanLine],
  ["log", "Log", ListChecks],
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
            <Utensils size={16} />
          </span>
          <span className="brand-name">Meal access</span>
          {activeList?.property && (
            <span className="brand-sub">{activeList.property}</span>
          )}
        </span>
        <nav className="segmented tabs">
          {SCREENS.map(([id, label, Icon]) => (
            <button
              key={id}
              className={current === id ? "on" : ""}
              aria-current={current === id ? "page" : undefined}
              aria-label={label}
              onClick={() => setScreen(id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="tab-label">{label}</span>
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
