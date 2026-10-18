# Scheduling components

`ProposedDateSelector` composes `DatePicker` and `ProposedDateOption`. Pass `options`, controlled `selected` date strings, `onChange`, and `observationDeadline`. Keep selection in the parent; calendar toggles and card removal use the same callback. `defaultMonth`, `disabled`, `error`, and `calendarIcon` are optional. The interactive preview is `/test/task-2`.

Dates use valid `YYYY-MM-DD` strings. Each option has `date`, `meetingTime`, and optional `disabled`. Supply one pre-resolved meeting per date; duplicate dates produce feedback rather than silently selecting a meeting. Backend/page integration must resolve multiple meetings on the same day.

The deadline is an **exclusive date-only cutoff**, following Figma's “before the observation deadline” wording. UTC is used internally only to preserve calendar dates across browser time zones; meeting-time strings are displayed as supplied. The backend must define the actual scheduling time zone, exact timestamp cutoff, availability, and permissions and validate submissions independently.

Invalid or newly unavailable selections remain visible and removable, with feedback. Changing options or the deadline does not silently erase parent state. The parent can reset selection when its course/section changes. There are no separate Add or Change date/time actions.

The Calendar icon belongs to Person 1 and is not implemented in the repository yet. Pass their shared component through `calendarIcon` when available; these components do not create another icon implementation. Calendar navigation reuses Aaron's Button with the text chevrons shown in Figma. DayPicker retains its own day buttons and keyboard focus management.

The calendar wraps `@daypicker/react` 10.0.2 using its `multiple`, `selected`, `onSelect`, disabled matcher, `navLayout`, and `timeZone` APIs. Its bundled stylesheet is imported by the wrapper; the adjacent CSS module adapts it to existing Assessment Helper tokens without changing the global theme.
