import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listCustomers } from "@/lib/customers";
import CustomerCrm from "@/components/CustomerCrm";
import { DEFAULT_REVIEW_URL } from "@/lib/reviewMessage";
import type { CustomerRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let customers: CustomerRecord[] = [];
  let error: string | null = null;

  try {
    customers = await listCustomers();
  } catch (e) {
    console.error("CrmPage load error:", e);
    error = e instanceof Error ? e.message : "Customers could not be loaded.";
  }

  const reviewUrl = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL || DEFAULT_REVIEW_URL;

  return (
    <main className="w-full flex-1 bg-slate-950 pb-16 text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-slate-100">Customers</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every customer keyed by phone number — how often they buy, what they bought,
            their children&apos;s birthdays, and whether they have left a Google review.
          </p>
        </header>

        {error ? (
          <p className="rounded border border-red-900 bg-red-950/60 p-3 text-sm text-red-300">
            {error}
          </p>
        ) : (
          <CustomerCrm initial={customers} reviewUrl={reviewUrl} />
        )}

        <p className="mt-6 text-xs text-slate-500">
          Review requests open WhatsApp or your SMS app with the message pre-filled — you
          press send. Set <code className="text-slate-400">NEXT_PUBLIC_GOOGLE_REVIEW_URL</code>{" "}
          to your Google Business review link so customers land on the right page.
        </p>
      </div>
    </main>
  );
}
