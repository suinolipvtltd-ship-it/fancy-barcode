"use client";

import { useMemo, useState } from "react";
import type { ReminderRecord } from "@/lib/types";

interface Props {
  initial: ReminderRecord[];
  from: string;
  to: string;
}

function monthKey(isoDay: string): string {
  return isoDay.slice(0, 7);
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
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

export default function ReminderCalendar({ initial, from, to }: Props) {
  const [reminders, setReminders] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<ReminderRecord | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, ReminderRecord[]>();
    for (const reminder of reminders) {
      const key = monthKey(reminder.eventDate);
      const list = map.get(key);
      if (list) list.push(reminder);
      else map.set(key, [reminder]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [reminders]);

  async function remove(reminder: ReminderRecord) {
    setBusyId(reminder.id);
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
      setReminders((prev) => prev.filter((row) => row.id !== reminder.id));
      setRemoved(reminder);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the reminder.");
    } finally {
      setBusyId(null);
    }
  }

  async function undo() {
    if (!removed) return;
    setBusyId(removed.id);
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
      setReminders((prev) =>
        [...prev, removed].sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
      );
      setRemoved(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore the reminder.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
        <span>
          Showing <strong className="text-gray-900">{reminders.length}</strong> reminder
          {reminders.length === 1 ? "" : "s"} from {from} to {to}.
        </span>
        {removed && (
          <button
            type="button"
            onClick={undo}
            disabled={busyId !== null}
            className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Undo remove {removed.customerName || "reminder"}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="rounded border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">
          No reminders in this range. Capture a sale in the browser extension to create
          one.
        </p>
      ) : (
        groups.map(([key, rows]) => (
          <div key={key}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {monthLabel(key)}
              <span className="ml-2 font-normal normal-case text-gray-400">
                {rows.length} reminder{rows.length === 1 ? "" : "s"}
              </span>
            </h2>

            <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
              {rows.map((reminder) => (
                <li
                  key={reminder.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                        {dayLabel(reminder.eventDate)}
                      </span>
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
                        className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Google event
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(reminder)}
                      disabled={busyId === reminder.id}
                      className="rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {busyId === reminder.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
