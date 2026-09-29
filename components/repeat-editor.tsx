"use client"

import {
  DAY_NAMES,
  DAY_PICKER_ORDER,
  NO_REPEAT,
  type RepeatRule,
} from "@/lib/repeat-rule"

interface RepeatEditorProps {
  value: RepeatRule
  onChange: (rule: RepeatRule) => void
  idPrefix: string
}

type RepeatKind = RepeatRule["kind"]

const KIND_LABELS: Array<{ kind: RepeatKind; label: string }> = [
  { kind: "none", label: "Does not repeat" },
  { kind: "daily", label: "Daily" },
  { kind: "weekly", label: "Weekly" },
  { kind: "monthly", label: "Monthly" },
]

const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/** Sensible starting rule when the user switches repeat kind. */
function defaultRuleFor(kind: RepeatKind, previous: RepeatRule): RepeatRule {
  switch (kind) {
    case "none":
      return NO_REPEAT
    case "daily":
      return { kind: "daily", interval: 1 }
    case "weekly":
      return {
        kind: "weekly",
        // Carry the days over when coming back from another kind.
        days: previous.kind === "weekly" && previous.days.length > 0 ? previous.days : [new Date().getDay()],
        interval: 1,
      }
    case "monthly":
      return { kind: "monthly", dayOfMonth: new Date().getDate() }
  }
}

export default function RepeatEditor({ value, onChange, idPrefix }: RepeatEditorProps) {
  const toggleDay = (dayIndex: number) => {
    if (value.kind !== "weekly") return
    const days = value.days.includes(dayIndex)
      ? value.days.filter((day) => day !== dayIndex)
      : [...value.days, dayIndex].sort((a, b) => a - b)
    // Never let the picker reach zero days — that would silently stop the alarm.
    if (days.length === 0) return
    onChange({ ...value, days })
  }

  return (
    <fieldset className="xp-groupbox">
      <legend>Repeat</legend>
      <div className="xp-prow">
        <label htmlFor={`${idPrefix}-repeat-kind`}>Repeat:</label>
        <select
          id={`${idPrefix}-repeat-kind`}
          value={value.kind}
          onChange={(event) => onChange(defaultRuleFor(event.target.value as RepeatKind, value))}
        >
          {KIND_LABELS.map(({ kind, label }) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {value.kind === "daily" && (
        <div className="xp-prow">
          <label htmlFor={`${idPrefix}-repeat-days-interval`}>Every</label>
          <span className="xp-inline">
            <input
              id={`${idPrefix}-repeat-days-interval`}
              type="number"
              min={1}
              max={52}
              value={value.interval}
              onChange={(event) =>
                onChange({ kind: "daily", interval: Math.max(1, Number(event.target.value) || 1) })
              }
            />
            day(s)
          </span>
        </div>
      )}

      {value.kind === "weekly" && (
        <>
          <div className="xp-pcol">
            <span>On:</span>
            <div className="xp-weekdays" role="group" aria-label="Repeat days">
              {DAY_PICKER_ORDER.map((dayIndex) => (
                <button
                  key={dayIndex}
                  type="button"
                  className="xp-btn"
                  aria-pressed={value.days.includes(dayIndex)}
                  aria-label={DAY_FULL[dayIndex]}
                  onClick={() => toggleDay(dayIndex)}
                >
                  {DAY_NAMES[dayIndex].slice(0, 2)}
                </button>
              ))}
            </div>
          </div>
          <div className="xp-prow">
            <label htmlFor={`${idPrefix}-repeat-weeks-interval`}>Every</label>
            <span className="xp-inline">
              <input
                id={`${idPrefix}-repeat-weeks-interval`}
                type="number"
                min={1}
                max={52}
                value={value.interval}
                onChange={(event) =>
                  onChange({ ...value, interval: Math.max(1, Number(event.target.value) || 1) })
                }
              />
              week(s)
            </span>
          </div>
        </>
      )}

      {value.kind === "monthly" && (
        <>
          <div className="xp-prow">
            <label htmlFor={`${idPrefix}-repeat-day-of-month`}>On day</label>
            <span className="xp-inline">
              <input
                id={`${idPrefix}-repeat-day-of-month`}
                type="number"
                min={1}
                max={31}
                value={value.dayOfMonth}
                onChange={(event) =>
                  onChange({
                    kind: "monthly",
                    dayOfMonth: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                  })
                }
              />
              of each month
            </span>
          </div>
          <p className="xp-hint">Months that are too short ring on their last day.</p>
        </>
      )}
    </fieldset>
  )
}
