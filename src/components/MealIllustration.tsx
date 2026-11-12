import type { Meal } from '../lib/db'

/**
 * Small line illustrations that tell the meals apart at a glance: a coffee cup at sunrise for
 * breakfast, a plate under the moon for dinner. Colours come from CSS (see `.meal-illus`).
 */
export function MealIllustration({ meal, size = 64 }: { meal: Meal; size?: number }) {
  return (
    <span className={`meal-illus ${meal}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg
        viewBox="0 0 64 64"
        width={size * 0.8}
        height={size * 0.8}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {meal === 'breakfast' ? <Breakfast /> : <Dinner />}
      </svg>
    </span>
  )
}

function Breakfast() {
  return (
    <>
      {/* Rising sun behind the cup */}
      <circle className="illus-soft" cx="47" cy="21" r="7.5" />
      <path d="M47 8v2.5M55.5 12.5l-1.8 1.8M60 21h-2.5M38.5 12.5l1.8 1.8" />
      {/* Steam */}
      <path d="M20 24c-2-2.5 2-4.5 0-7M27 24c-2-2.5 2-4.5 0-7" />
      {/* Cup and saucer */}
      <path className="illus-surface" d="M13 29h23v9a11.5 11.5 0 0 1-23 0z" />
      <path d="M36 32h3a4.5 4.5 0 0 1 0 9h-3.6" />
      <path d="M13 33h23" opacity="0.45" />
      <path d="M8 55h33" />
    </>
  )
}

function Dinner() {
  return (
    <>
      {/* Moon and stars */}
      <path className="illus-soft" d="M49 7a9 9 0 1 0 8 13.5A7.5 7.5 0 0 1 49 7z" />
      <path d="M15 8v6M12 11h6M29 5v4M27 7h4" />
      {/* Plate */}
      <circle className="illus-surface" cx="32" cy="41" r="14" />
      <circle cx="32" cy="41" r="8.5" opacity="0.45" />
      {/* Fork */}
      <path d="M9 30v6a3 3 0 0 0 6 0v-6M12 30v25" />
      {/* Knife */}
      <path d="M52 55V30c3.5 2 4.5 6 4.5 11H52" />
    </>
  )
}
