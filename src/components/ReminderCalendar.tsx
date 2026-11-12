"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChildGender, ReminderRecord } from "@/lib/types";

interface Props {
  initial: ReminderRecord[];
  /** `YYYY-MM` for the month rendered first. */
  initialMonth: string;
}

type GenderFilter = "all" | "girl" | "boy";
type ViewMode = "calendar" | "month";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const AGE_FILTERS = [
  { value: "all", label: "Any age" },
  { value: "0-2", label: "0 – 2 years" },
  { value: "3-5", label: "3 – 5 years" },
  { value: "6-8", label: "6 – 8 years" },
  { value: "9-12", label: "9 – 12 years" },
  { value: "13+", label: "13+ years" },
];

const COST_FILTERS = [
  { value: "all", label: "Any value" },
  { value: "1000", label: "Above ₹1,000" },
  { value: "2000", label: "Above ₹2,000" },
  { value: "3000", label: "Above ₹3,000" },
  { value: "5000", label: "Above ₹5,000" },
];

const pad = (value: number) => String(value).padStart(2, "0");

function ymd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthStart(month: string): Date {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex - 1, 1, 12);
}

function monthOf(isoDay: string): string {
  return isoDay.slice(0, 7);
}

function monthLabel(month: string): string {
  return monthStart(month).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function shortDayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function shiftMonth(month: string, delta: number): string {
  const date = monthStart(month);
  date.setMonth(date.getMonth() + delta);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function shiftYear(month: string, delta: number): string {
  const date = monthStart(month);
  date.setFullYear(date.getFullYear() + delta);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function monthRange(month: string): { from: string; to: string } {
  const [year, monthIndex] = month.split("-").map(Number);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return {
    from: `${year}-${pad(monthIndex)}-01`,
    to: `${year}-${pad(monthIndex)}-${pad(lastDay)}`,
  };
}

/** Six weeks of dates covering the month, starting on the preceding Sunday. */
function buildGrid(month: string): Date[] {
  const first = monthStart(month);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function groupByDay(reminders: ReminderRecord[]): Record<string, ReminderRecord[]> {
  const map: Record<string, ReminderRecord[]> = {};
  for (const reminder of reminders) {
    (map[reminder.eventDate] ||= []).push(reminder);
  }
  return map;
}

function dayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function itemSummary(reminder: ReminderRecord): string {
  const items = reminder.items.filter((item) => item.name || item.sku);
  if (items.length === 0) return "No product captured";
  return items
    .map((item) => {
      const parts = [item.name || item.sku];
      if (item.size) parts.push(`Size ${item.size}`);
      if (item.qty > 1) parts.push(`× ${item.qty}`);
      return parts.filter(Boolean).join(" · ");
    })
    .join(", ");
}

function childSummary(reminder: ReminderRecord): string | null {
  const parts: string[] = [];
  if (reminder.childGender === "girl") parts.push("Girl");
  if (reminder.childGender === "boy") parts.push("Boy");
  if (reminder.childAgeYears !== null) parts.push(`${reminder.childAgeYears} yrs`);
  return parts.length ? parts.join(" · ") : null;
}

/** `12 Mar` — day and month only, the year of the birthday is not meaningful. */
function birthdayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

/** `https://wa.me/<country><number>?text=…` — assumes Indian numbers. */
function whatsappLink(reminder: ReminderRecord): string | null {
  if (!reminder.customerPhone) return null;
  let digits = reminder.customerPhone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 10) return null;

  const first = reminder.items.find((item) => item.name || item.sku);
  const product = first
    ? [first.name || first.sku, first.size ? `size ${first.size}` : null]
        .filter(Boolean)
        .join(" ")
    : null;

  const message = `Hi ${reminder.customerName || "there"}, this is a friendly reminder from the shop.${
    product ? ` Hope the ${product} is going well!` : ""
  }`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function ageMatches(age: number | null, range: string): boolean {
  if (range === "all") return true;
  if (age === null) return false;
  if (range === "13+") return age >= 13;
  const [min, max] = range.split("-").map(Number);
  return age >= min && age <= max;
}

function costMatches(total: string | null, threshold: string): boolean {
  if (threshold === "all") return true;
  const value = total === null ? 0 : Number(total);
  return Number.isFinite(value) && value > Number(threshold);
}

function matchesFilters(
  reminder: ReminderRecord,
  filters: { gender: GenderFilter; age: string; cost: string },
): boolean {
  if (filters.gender !== "all" && reminder.childGender !== filters.gender) return false;
  if (!ageMatches(reminder.childAgeYears, filters.age)) return false;
  if (!costMatches(reminder.totalAmount, filters.cost)) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Editor                                                                     */
/* -------------------------------------------------------------------------- */

interface DraftItem {
  id: string | null;
  name: string;
  size: string;
  qty: string;
}

function ReminderEditor({
  reminder,
  onSaved,
  onCancel,
  onRemoved,
}: {
  reminder: ReminderRecord;
  onSaved: (next: ReminderRecord) => void;
  onCancel: () => void;
  onRemoved: (removed: ReminderRecord) => void;
}) {
  const [items, setItems] = useState<DraftItem[]>(() =>
    reminder.items.length
      ? reminder.items.map((item) => ({
          id: item.id,
          name: item.name ?? "",
          size: item.size ?? "",
          qty: String(item.qty),
        }))
      : [{ id: null, name: "", size: "", qty: "1" }],
  );
  const [gender, setGender] = useState<ChildGender | "">(reminder.childGender ?? "");
  const [age, setAge] = useState(
    reminder.childAgeYears === null ? "" : String(reminder.childAgeYears),
  );
  const [birthday, setBirthday] = useState(reminder.childBirthday ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    );
  }

  function addRow() {
    setItems((prev) => [...prev, { id: null, name: "", size: "", qty: "1" }]);
  }

  function removeRow(index: number) {
    setItems((prev) =>
      prev.length === 1
        ? [{ id: null, name: "", size: "", qty: "1" }]
        : prev.filter((_, position) => position !== index),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: reminder.id,
          childGender: gender === "" ? null : gender,
          childAgeYears: age.trim() === "" ? null : Number(age),
          childBirthday: birthday.trim() === "" ? null : birthday,
          items: items
            .map((item) => ({
              id: item.id,
              name: item.name.trim() || null,
              size: item.size.trim() || null,
              qty: Number(item.qty) || 1,
            }))
            .filter((item) => item.id || item.name || item.size),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      onSaved(data.reminder as ReminderRecord);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the reminder.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-700 bg-slate-800/70 p-3">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-300">
          Products
        </p>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id ?? `new-${index}`} className="flex gap-2">
              <input
                value={item.name}
                onChange={(event) => update(index, { name: event.target.value })}
                placeholder="Product"
                className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500"
              />
              <input
                value={item.size}
                onChange={(event) => update(index, { size: event.target.value })}
                placeholder="Size"
                className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500"
              />
              <input
                value={item.qty}
                onChange={(event) => update(index, { qty: event.target.value })}
                type="number"
                min="1"
                className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                title="Remove product"
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-400 hover:bg-slate-700"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-blue-300 hover:bg-slate-700"
        >
          + Add product
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-300">
            Order for
          </p>
          <div className="flex gap-1">
            {(
              [
                ["", "Not set"],
                ["girl", "Girl"],
                ["boy", "Boy"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value || "none"}
                type="button"
                onClick={() => setGender(value)}
                className={`rounded border px-3 py-1 text-xs ${
                  gender === value
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-600 bg-slate-900 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="text-xs text-slate-400">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-blue-300">
            Child age (years)
          </span>
          <input
            value={age}
            onChange={(event) => setAge(event.target.value)}
            type="number"
            min="0"
            max="25"
            placeholder="e.g. 4"
            className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </label>

        <label className="text-xs text-slate-400">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-green-300">
            Birthday
          </span>
          <input
            value={birthday}
            onChange={(event) => setBirthday(event.target.value)}
            type="date"
            className="w-40 rounded border border-green-700/60 bg-slate-900 px-2 py-1 text-sm text-slate-100 scheme-dark"
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save details"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded border border-slate-600 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onRemoved(reminder)}
          className="ml-auto rounded border border-red-900 bg-slate-900 px-3 py-1 text-xs text-red-400 hover:bg-red-950"
        >
          Remove reminder
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

function ReminderCard({
  reminder,
  editing,
  showDate,
  onToggleEdit,
  onSaved,
  onRemoved,
}: {
  reminder: ReminderRecord;
  editing: boolean;
  showDate?: boolean;
  onToggleEdit: () => void;
  onSaved: (next: ReminderRecord) => void;
  onRemoved: (removed: ReminderRecord) => void;
}) {
  const child = childSummary(reminder);
  const whatsapp = whatsappLink(reminder);

  return (
    <li className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {showDate && (
              <span className="rounded bg-blue-900/60 px-2 py-0.5 text-[11px] font-semibold text-blue-200">
                {shortDayLabel(reminder.eventDate)}
              </span>
            )}
            <span className="text-sm font-medium text-slate-100">
              {reminder.customerName || "Walk-in customer"}
              <span className="ml-1 text-xs font-normal tabular-nums text-blue-300">
                ({reminder.externalId})
              </span>
            </span>
            {reminder.customerPhone && (
              <a
                href={`tel:${reminder.customerPhone}`}
                className="text-xs text-slate-400 hover:text-blue-300"
              >
                {reminder.customerPhone}
              </a>
            )}
            {child && (
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-blue-200">
                {child}
              </span>
            )}
            {reminder.childBirthday && (
              <span className="rounded bg-green-200 px-2 py-0.5 text-[11px] font-medium text-green-900">
                🎂 {birthdayLabel(reminder.childBirthday)}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-slate-300">{itemSummary(reminder)}</p>

          <p className="mt-1 text-xs text-slate-400">
            Sold{" "}
            {new Date(reminder.soldAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {reminder.totalAmount ? ` · ₹${reminder.totalAmount}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-green-800 bg-slate-900 px-2 py-1 text-xs text-green-300 hover:bg-green-950"
            >
              WhatsApp
            </a>
          )}
          {reminder.htmlLink && (
            <a
              href={reminder.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-slate-700 px-2 py-1 text-xs text-blue-300 hover:bg-slate-800"
            >
              Google event
            </a>
          )}
          <button
            type="button"
            onClick={onToggleEdit}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-blue-300 hover:bg-slate-800"
          >
            {editing ? "Close" : "Edit details"}
          </button>
        </div>
      </div>

      {editing && (
        <ReminderEditor
          reminder={reminder}
          onSaved={onSaved}
          onCancel={onToggleEdit}
          onRemoved={onRemoved}
        />
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Calendar                                                                   */
/* -------------------------------------------------------------------------- */

export default function ReminderCalendar({ initial, initialMonth }: Props) {
  const today = ymd(new Date());
  const [month, setMonth] = useState(initialMonth);
  const [byDay, setByDay] = useState<Record<string, ReminderRecord[]>>(() =>
    groupByDay(initial),
  );
  const [selected, setSelected] = useState<string>(() =>
    initial.length > 0 ? initial[0].eventDate : today,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAll, setEditAll] = useState(false);
  const [view, setView] = useState<ViewMode>("calendar");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [costFilter, setCostFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<ReminderRecord | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const { from, to } = monthRange(month);
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/reminders?from=${from}&to=${to}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        return data.reminders as ReminderRecord[];
      })
      .then((reminders) => {
        if (cancelled) return;
        setByDay(groupByDay(reminders));
        setEditingId(null);
        setEditAll(false);
        setSelected(reminders.length > 0 ? reminders[0].eventDate : `${month}-01`);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load this month.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  const grid = useMemo(() => buildGrid(month), [month]);
  const monthReminders = useMemo(
    () => Object.values(byDay).flat().filter((r) => monthOf(r.eventDate) === month),
    [byDay, month],
  );
  const visibleReminders = useMemo(
    () =>
      monthReminders
        .filter((reminder) =>
          matchesFilters(reminder, {
            gender: genderFilter,
            age: ageFilter,
            cost: costFilter,
          }),
        )
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [monthReminders, genderFilter, ageFilter, costFilter],
  );
  const visibleByDay = useMemo(() => groupByDay(visibleReminders), [visibleReminders]);
  const dayReminders = visibleByDay[selected] ?? [];

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const base = monthStart(month).getFullYear();
    const from = Math.min(current, base) - 1;
    return Array.from({ length: 7 }, (_, index) => from + index);
  }, [month]);

  const filtersActive =
    genderFilter !== "all" || ageFilter !== "all" || costFilter !== "all";

  function replaceEverywhere(next: ReminderRecord) {
    setByDay((prev) => {
      const copy: Record<string, ReminderRecord[]> = {};
      for (const [key, list] of Object.entries(prev)) {
        copy[key] = list.map((row) => (row.id === next.id ? next : row));
      }
      return copy;
    });
    setEditingId(null);
  }

  async function remove(reminder: ReminderRecord) {
    setError(null);
    try {
      const response = await fetch(
        `/api/reminders?id=${encodeURIComponent(reminder.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      setByDay((prev) => ({
        ...prev,
        [reminder.eventDate]: (prev[reminder.eventDate] ?? []).filter(
          (row) => row.id !== reminder.id,
        ),
      }));
      setEditingId(null);
      setRemoved(reminder);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the reminder.");
    }
  }

  async function undo() {
    if (!removed) return;
    setError(null);
    try {
      const response = await fetch(
        `/api/reminders?id=${encodeURIComponent(removed.id)}&restore=1`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      const restored = removed;
      setByDay((prev) => ({
        ...prev,
        [restored.eventDate]: [...(prev[restored.eventDate] ?? []), restored],
      }));
      setRemoved(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore the reminder.");
    }
  }

  const monthButton =
    "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-blue-300 hover:bg-slate-800";

  return (
    <section className="space-y-4 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth(shiftYear(month, -1))}
            className={monthButton}
            aria-label="Previous year"
            title="Previous year"
          >
            «
          </button>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className={monthButton}
            aria-label="Previous month"
          >
            ‹
          </button>

          <h2 className="min-w-36 text-center text-base font-semibold text-blue-100">
            {monthLabel(month)}
          </h2>

          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            className={monthButton}
            aria-label="Next month"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => setMonth(shiftYear(month, 1))}
            className={monthButton}
            aria-label="Next year"
            title="Next year"
          >
            »
          </button>

          <select
            value={String(monthStart(month).getFullYear())}
            onChange={(event) => {
              const year = Number(event.target.value);
              setMonth(`${year}-${pad(monthStart(month).getMonth() + 1)}`);
              setEditingId(null);
            }}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-blue-200"
            aria-label="Jump to year"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setMonth(monthOf(today));
              setSelected(today);
              setEditingId(null);
            }}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-blue-300 hover:bg-slate-800"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">
            {loading
              ? "Loading…"
              : `${visibleReminders.length} reminder${
                  visibleReminders.length === 1 ? "" : "s"
                }`}
          </span>
          <div className="flex overflow-hidden rounded border border-slate-700">
            {(
              [
                ["calendar", "Calendar"],
                ["month", "Month list"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={`px-3 py-1 text-xs ${
                  view === value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-900 text-blue-300 hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
        <label className="flex items-center gap-1">
          <span className="font-semibold uppercase tracking-wide">Gender</span>
          <select
            value={genderFilter}
            onChange={(event) => setGenderFilter(event.target.value as GenderFilter)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          >
            <option value="all">All</option>
            <option value="girl">Girl</option>
            <option value="boy">Boy</option>
          </select>
        </label>

        <label className="flex items-center gap-1">
          <span className="font-semibold uppercase tracking-wide">Age</span>
          <select
            value={ageFilter}
            onChange={(event) => setAgeFilter(event.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          >
            {AGE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1">
          <span className="font-semibold uppercase tracking-wide">Order value</span>
          <select
            value={costFilter}
            onChange={(event) => setCostFilter(event.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          >
            {COST_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setGenderFilter("all");
              setAgeFilter("all");
              setCostFilter("all");
            }}
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-blue-300 hover:bg-slate-700"
          >
            Clear filters
          </button>
        )}

        <span className="flex items-center gap-1 text-green-300">
          <span className="inline-block h-3 w-3 rounded bg-green-200" />
          Birthday
        </span>

        <span className="ml-auto text-blue-300">
          {visibleReminders.length} of {monthReminders.length} this month
        </span>
      </div>

      {error && (
        <p className="rounded border border-red-900 bg-red-950/60 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {!loading && !error && monthReminders.length === 0 && (
        <p className="rounded border border-slate-700 bg-slate-900 p-3 text-sm text-blue-200">
          No reminders in {monthLabel(month)}. Follow-ups are booked about a year after
          the sale — use <strong>›</strong> or the year picker to move forward.
        </p>
      )}

      {removed && (
        <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
          <span>Removed {removed.customerName || "reminder"}.</span>
          <button
            type="button"
            onClick={undo}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-blue-300 hover:bg-slate-700"
          >
            Undo
          </button>
        </div>
      )}

      <div
        className={`overflow-hidden rounded-lg border border-slate-800 bg-slate-900 ${
          view === "calendar" ? "" : "hidden"
        }`}
      >
        <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/60">
          {WEEKDAYS.map((label) => (
            <div
              key={label}
              className="px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-blue-300"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {grid.map((date) => {
            const iso = ymd(date);
            const inMonth = monthOf(iso) === month;
            const rows = visibleByDay[iso] ?? [];
            const isToday = iso === today;
            const isSelected = iso === selected;
            const birthdayDay = rows.some((reminder) => reminder.childBirthday !== null);

            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  setSelected(iso);
                  setEditingId(null);
                }}
                title={birthdayDay ? "Birthday reminder" : undefined}
                className={`min-h-24 border-b border-r border-slate-800 p-1.5 text-left align-top last:border-r-0 ${
                  birthdayDay
                    ? "bg-green-200"
                    : inMonth
                      ? "bg-slate-900"
                      : "bg-slate-950/70"
                } ${isSelected ? "ring-2 ring-inset ring-blue-500" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday
                        ? "bg-blue-600 font-semibold text-white"
                        : birthdayDay
                          ? "font-semibold text-green-950"
                          : inMonth
                            ? "text-slate-100"
                            : "text-slate-500"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {rows.length > 2 && (
                    <span
                      className={`text-[10px] ${
                        birthdayDay ? "text-green-900" : "text-slate-500"
                      }`}
                    >
                      +{rows.length - 2}
                    </span>
                  )}
                </div>

                <div className="mt-1 space-y-1">
                  {rows.slice(0, 2).map((reminder) => (
                    <span
                      key={reminder.id}
                      className={`block truncate rounded px-1 py-0.5 text-[11px] ${
                        reminder.childBirthday
                          ? "bg-green-100 text-green-950"
                          : birthdayDay
                            ? "bg-slate-900/80 text-slate-100"
                            : "bg-slate-800 text-blue-100"
                      }`}
                    >
                      {reminder.customerName || "Reminder"}
                      {reminder.childGender === "girl"
                        ? " · girl"
                        : reminder.childGender === "boy"
                          ? " · boy"
                          : ""}
                      {reminder.childBirthday ? " 🎂" : ""}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {view === "month" ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-blue-100">
              {monthLabel(month)} · all reminders
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditAll((value) => !value)}
                className={`rounded border px-3 py-1 text-xs ${
                  editAll
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-700 bg-slate-900 text-blue-300 hover:bg-slate-800"
                }`}
              >
                {editAll ? "Close all editors" : "Edit all"}
              </button>
            </div>
          </div>

          {visibleReminders.length === 0 ? (
            <p className="rounded border border-slate-800 bg-slate-900 p-4 text-sm text-blue-200">
              Nothing matches these filters this month.
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleReminders.map((reminder) => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  showDate
                  editing={editAll || editingId === reminder.id}
                  onToggleEdit={() => {
                    if (editAll) {
                      setEditAll(false);
                      setEditingId(reminder.id);
                      return;
                    }
                    setEditingId(editingId === reminder.id ? null : reminder.id);
                  }}
                  onSaved={replaceEverywhere}
                  onRemoved={remove}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-blue-100">
            {dayLabel(selected)}
            <span className="ml-2 font-normal text-slate-400">
              {dayReminders.length} reminder{dayReminders.length === 1 ? "" : "s"}
            </span>
          </h3>

          {dayReminders.length === 0 ? (
            <p className="rounded border border-slate-800 bg-slate-900 p-4 text-sm text-blue-200">
              Nothing booked for this day.
            </p>
          ) : (
            <ul className="space-y-2">
              {dayReminders.map((reminder) => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  editing={editingId === reminder.id}
                  onToggleEdit={() =>
                    setEditingId(editingId === reminder.id ? null : reminder.id)
                  }
                  onSaved={replaceEverywhere}
                  onRemoved={remove}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
