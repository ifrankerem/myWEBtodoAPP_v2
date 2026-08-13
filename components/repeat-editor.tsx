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
    <div className="xp-repeat-editor">
      <div className="xp-field">
        <label htmlFor={`${idPrefix}-repeat-kind`}>Repeat</label>
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
        <div className="xp-field">
          <label htmlFor={`${idPrefix}-repeat-days-interval`}>Every N days</label>
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
        </div>
      )}

      {value.kind === "weekly" && (
        <>
          <div className="xp-field">
            <label htmlFor={`${idPrefix}-repeat-weeks-interval`}>Every N weeks</label>
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
          </div>
          <div className="xp-day-picker" aria-label="Repeat days">
            {DAY_PICKER_ORDER.map((dayIndex) => (
              <button
                key={dayIndex}
                type="button"
                className="xp-button"
                aria-pressed={value.days.includes(dayIndex)}
                onClick={() => toggleDay(dayIndex)}
              >
                {DAY_NAMES[dayIndex]}
              </button>
            ))}
          </div>
        </>
      )}

      {value.kind === "monthly" && (
        <div className="xp-field">
          <label htmlFor={`${idPrefix}-repeat-day-of-month`}>Day of month</label>
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
          <p className="xp-settings-help">Months that are too short fire on their last day.</p>
        </div>
      )}
    </div>
  )
}
