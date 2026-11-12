# Meal access

Checks restaurant guests at the entrance by their RFID tag. The guard loads the day's two
Rex "Meal Attendance Reports" (one for breakfast, one for dinner), picks Breakfast or Dinner, and
scans tags: each scan is checked against that meal's list, shows **Granted**,
**Already scanned** or **Denied**, and is logged.

Runs entirely in the browser (React + TypeScript + Vite). There is no backend: the guest list and
scan log are stored in the browser's IndexedDB on the entrance laptop.

## How it works

- **Import** – load the breakfast list and the dinner list separately (each card takes its own
  report as `.xlsx` or `.csv`, the Rex PDF converted to a spreadsheet).
  Columns are found by their headers (`Rez #`, `Unit #`, `Client Name`, `Occ(s)`, `Qty`); a guest
  row is any row whose Rez # is all digits. The occupants read must add up to the report's
  `Total:` line or the file is refused. A new list replaces only that meal's list. The import warns
  about guests with no Unit # or sharing a Unit #, because tags are matched by Unit #.
- **Scan** – the RFID reader works as a USB keyboard (HID): it types the guest's **Unit #** (e.g.
  `NV-214`) and presses Enter. Matching ignores case and spaces; if two guests share a unit, the
  first one listed is matched.
  The app listens on the whole page, so focus doesn't matter, and ignores keys typed slower than
  `SCAN_KEY_GAP_MS` (100 ms) apart, i.e. a person typing. A guest scanned twice for the same meal
  on the same day shows **Already scanned**; it is not blocked.
- **Log** – filter by day, meal and result. **Summary PDF** is a one-page table per meal: guests on
  the list, guests who took the meal and who didn't, attendance %, occupants, repeat and denied
  scans, and first/last scan times. **Full report PDF** gives one section per meal, each
  laid out like that meal's uploaded list (Rez #, Unit #, Client Name, Occ(s), Qty) plus the time
  each guest was let in, or "Not scanned". Tags that weren't on the list follow in a separate
  table. Every imported list is kept, so past days can still be exported.

### Keeping the log safe

Browser storage can be wiped by "clear browsing data", so the app also writes the log to disk:

1. When the guard switches meal, the finished meal's scans are downloaded as
   `meal-log-YYYY-MM-DD-<meal>.pdf` (only if something changed since the last export).
2. Optionally (Chrome/Edge), **Log → Choose folder** keeps `meal-log-YYYY-MM-DD.csv` in that folder
   up to date after every scan. After a browser restart the guard may need to click
   **Reconnect folder** once.

The app also asks the browser to keep its storage (`navigator.storage.persist()`).

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parser, scan rules and scanner timing
npm run build    # production build in dist/
```

To check the parser against a real converted report:

```bash
REPORT_SAMPLE="path/to/report.xlsx" npm test
```

## Deploying and updates

`npm run build` produces a static site in `dist/` that can be hosted anywhere static
(Cloudflare Pages, Netlify, GitHub Pages, IIS). It is a PWA: after the first visit it works
offline and can be installed as an app (browser menu → *Install*).

When a new version is deployed, the laptop downloads it in the background and shows
**"A new version is ready"**. It never reloads by itself, so an update can't interrupt a meal.

For the entrance laptop, open it full-screen, e.g. a shortcut to
`msedge --kiosk https://<your-site> --edge-kiosk-type=fullscreen`, or the installed app with F11.

## Code map

| File | What it does |
| --- | --- |
| `src/lib/report.ts` | Reads the report grid: header columns, guests, date, totals check |
| `src/lib/readFile.ts` | `.xlsx` / `.csv` → rows (SheetJS) |
| `src/lib/db.ts` | IndexedDB tables: lists, guests, scans, settings (Dexie) |
| `src/lib/scan.ts` | Granted / repeat / denied rule and logging |
| `src/lib/scannerBuffer.ts`, `useScanner.ts` | Turns fast keystrokes + Enter into a scan |
| `src/lib/exportLog.ts` | PDF download, auto-export on meal switch, CSV log folder |
| `src/lib/logPdf.ts` | Lays out the PDF log (jsPDF + jspdf-autotable) |
| `src/screens/*` | Import, Scan and Log screens |
