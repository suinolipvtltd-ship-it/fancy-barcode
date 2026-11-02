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
  const from = day(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const to = day(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 18, 0)));

  let reminders: ReminderRecord[] = [];
  let error: string | null = null;

  try {
    reminders = await listReminders({ from, to });
  } catch (e) {
    console.error("RemindersPage load error:", e);
    error = e instanceof Error ? e.message : "Reminders could not be loaded.";
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Reminders</h1>
        <p className="mt-1 text-sm text-gray-600">
          Birthday follow-ups booked from Swipe sales — customer, phone, product and size.
        </p>
      </header>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : (
        <ReminderCalendar initial={reminders} from={from} to={to} />
      )}
    </main>
  );
}
