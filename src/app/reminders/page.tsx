import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listReminders } from "@/lib/reminders";
import ReminderCalendar from "@/components/ReminderCalendar";
import type { ReminderRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function RemindersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, monthIndex] = month.split("-").map(Number);
  const from = day(new Date(Date.UTC(year, monthIndex - 1, 1)));
  const to = day(new Date(Date.UTC(year, monthIndex, 0)));

  let reminders: ReminderRecord[] = [];
  let initialMonth = month;
  let nextReminder: string | null = null;
  let error: string | null = null;

  try {
    reminders = await listReminders({ from, to });

    if (reminders.length > 0) {
      nextReminder = reminders[0].eventDate;
    } else {
      // Reminders land a year after the sale, so the current month is usually
      // empty. Open the calendar where the next booking actually is.
      const aheadTo = day(new Date(Date.UTC(year + 2, monthIndex, 0)));
      const ahead = await listReminders({ from: day(now), to: aheadTo });
      if (ahead.length > 0) {
        nextReminder = ahead[0].eventDate;
        initialMonth = nextReminder.slice(0, 7);
        reminders = ahead.filter(
          (reminder) => reminder.eventDate.slice(0, 7) === initialMonth,
        );
      }
    }
  } catch (e) {
    console.error("RemindersPage load error:", e);
    error = e instanceof Error ? e.message : "Reminders could not be loaded.";
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Reminders</h1>
        <p className="mt-1 text-sm text-gray-600">
          Birthday follow-ups booked from Swipe sales — customer, phone, product, size,
          and who the order was for.
        </p>
        {nextReminder && (
          <p className="mt-2 text-sm text-gray-800">
            Next reminder:{" "}
            <strong className="font-semibold">
              {new Date(`${nextReminder}T12:00:00`).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </strong>
          </p>
        )}
      </header>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : (
        <ReminderCalendar initial={reminders} initialMonth={initialMonth} />
      )}
    </main>
  );
}
