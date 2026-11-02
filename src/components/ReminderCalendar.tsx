"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChildGender, ReminderRecord } from "@/lib/types";

interface Props {
  initial: ReminderRecord[];
  /** `YYYY-MM` for the month rendered first. */
  initialMonth: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function shiftMonth(month: string, delta: number): string {
  const date = monthStart(month);
  date.setMonth(date.getMonth() + delta);
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
    <div className="mt-3 space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Products
        </p>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id ?? `new-${index}`} className="flex gap-2">
              <input
                value={item.name}
                onChange={(event) => update(index, { name: event.target.value })}
                placeholder="Product"
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <input
                value={item.size}
                onChange={(event) => update(index, { size: event.target.value })}
                placeholder="Size"
                className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <input
                value={item.qty}
                onChange={(event) => update(index, { qty: event.target.value })}
                type="number"
                min="1"
                className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                title="Remove product"
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          + Add product
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
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
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="text-xs text-gray-600">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Child age (years)
          </span>
          <input
            value={age}
            onChange={(event) => setAge(event.target.value)}
            type="number"
            min="0"
            max="25"
            placeholder="e.g. 4"
            className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save details"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onRemoved(reminder)}
          className="ml-auto rounded border border-red-200 bg-white px-3 py-1 text-xs text-red-700 hover:bg-red-50"
        >
          Remove reminder
        </button>
      </div>
    </div>
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
  const dayReminders = byDay[selected] ?? [];

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

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
            aria-label="Previous month"
          >
            ‹
          </button>
          <h2 className="min-w-40 text-center text-base font-semibold text-gray-900">
            {monthLabel(month)}
          </h2>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
            aria-label="Next month"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              setMonth(monthOf(today));
              setSelected(today);
            }}
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Today
          </button>
        </div>

        <span className="text-sm text-gray-600">
          {loading
            ? "Loading…"
            : `${monthReminders.length} reminder${monthReminders.length === 1 ? "" : "s"} this month`}
        </span>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {removed && (
        <div className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <span>Removed {removed.customerName || "reminder"}.</span>
          <button
            type="button"
            onClick={undo}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
          >
            Undo
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {WEEKDAYS.map((label) => (
            <div
              key={label}
              className="px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {grid.map((date) => {
            const iso = ymd(date);
            const inMonth = monthOf(iso) === month;
            const rows = byDay[iso] ?? [];
            const isToday = iso === today;
            const isSelected = iso === selected;

            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  setSelected(iso);
                  setEditingId(null);
                }}
                className={`min-h-24 border-b border-r border-gray-100 p-1.5 text-left align-top last:border-r-0 ${
                  inMonth ? "bg-white" : "bg-gray-50/60"
                } ${isSelected ? "ring-2 ring-inset ring-indigo-500" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday
                        ? "bg-indigo-600 font-semibold text-white"
                        : inMonth
                          ? "text-gray-900"
                          : "text-gray-400"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {rows.length > 2 && (
                    <span className="text-[10px] text-gray-400">+{rows.length - 2}</span>
                  )}
                </div>

                <div className="mt-1 space-y-1">
                  {rows.slice(0, 2).map((reminder) => (
                    <span
                      key={reminder.id}
                      className="block truncate rounded bg-indigo-50 px-1 py-0.5 text-[11px] text-indigo-900"
                    >
                      {reminder.customerName || "Reminder"}
                      {reminder.childGender === "girl"
                        ? " · girl"
                        : reminder.childGender === "boy"
                          ? " · boy"
                          : ""}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">
          {dayLabel(selected)}
          <span className="ml-2 font-normal text-gray-500">
            {dayReminders.length} reminder{dayReminders.length === 1 ? "" : "s"}
          </span>
        </h3>

        {dayReminders.length === 0 ? (
          <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            Nothing booked for this day.
          </p>
        ) : (
          <ul className="space-y-2">
            {dayReminders.map((reminder) => {
              const child = childSummary(reminder);
              return (
                <li
                  key={reminder.id}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-medium text-gray-900">
                          {reminder.customerName || "Walk-in customer"}
                        </span>
                        {reminder.customerPhone && (
                          <a
                            href={`tel:${reminder.customerPhone}`}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            {reminder.customerPhone}
                          </a>
                        )}
                        {child && (
                          <span className="rounded bg-pink-50 px-2 py-0.5 text-[11px] text-pink-700">
                            {child}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-gray-700">
                        {itemSummary(reminder)}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        Sold{" "}
                        {new Date(reminder.soldAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {reminder.totalAmount ? ` · ₹${reminder.totalAmount}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {reminder.htmlLink && (
                        <a
                          href={reminder.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          Google event
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setEditingId(editingId === reminder.id ? null : reminder.id)
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {editingId === reminder.id ? "Close" : "Edit details"}
                      </button>
                    </div>
                  </div>

                  {editingId === reminder.id && (
                    <ReminderEditor
                      reminder={reminder}
                      onSaved={replaceEverywhere}
                      onCancel={() => setEditingId(null)}
                      onRemoved={remove}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

