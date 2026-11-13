"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ChildGender,
  CustomerDetail,
  CustomerRecord,
  CustomerSale,
} from "@/lib/types";
import {
  ageFromBirthday,
  birthdayLabel,
  phoneDigits,
  smsReviewLink,
  telLink,
  whatsappReviewLink,
} from "@/lib/reviewMessage";

interface Props {
  initial: CustomerRecord[];
  /** Google review URL the messages point at. */
  reviewUrl: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function money(value: string | null): string {
  if (value === null) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

function relativeVisit(iso: string | null): string {
  const days = daysSince(iso);
  if (days === null) return "No visits yet";
  if (days <= 0) return "Visited today";
  if (days === 1) return "Visited yesterday";
  if (days < 30) return `Visited ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Visited ${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `Visited ${years} year${years === 1 ? "" : "s"} ago`;
}

function saleItemsLine(sale: CustomerSale): string {
  if (sale.items.length === 0) return "No line items captured";
  return sale.items
    .map((item) => {
      const parts = [item.name || item.sku || "Item"];
      if (item.size) parts.push(`size ${item.size}`);
      if (item.qty > 1) parts.push(`× ${item.qty}`);
      return parts.join(" · ");
    })
    .join(", ");
}

function matchesQuery(customer: CustomerRecord, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  if ((customer.name ?? "").toLowerCase().includes(term)) return true;
  if ((customer.phone ?? "").toLowerCase().includes(term)) return true;
  const digits = phoneDigits(term);
  if (digits.length >= 3 && phoneDigits(customer.phone).includes(digits)) return true;
  return customer.children.some((child) =>
    (child.name ?? "").toLowerCase().includes(term),
  );
}

interface DraftChild {
  id: string | null;
  name: string;
  gender: ChildGender | "";
  birthday: string;
}

function toDraft(children: CustomerRecord["children"]): DraftChild[] {
  if (children.length === 0) return [];
  return children.map((child) => ({
    id: child.id,
    name: child.name ?? "",
    gender: child.gender ?? "",
    birthday: child.birthday ?? "",
  }));
}

const inputClass =
  "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500";

/* -------------------------------------------------------------------------- */
/* Editor                                                                     */
/* -------------------------------------------------------------------------- */

function CustomerEditor({
  customer,
  onSaved,
  onCancel,
  onDeleted,
}: {
  customer: CustomerDetail;
  onSaved: (next: CustomerDetail) => void;
  onCancel: () => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(customer.name ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [note, setNote] = useState(customer.note ?? "");
  const [children, setChildren] = useState<DraftChild[]>(() => toDraft(customer.children));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, patch: Partial<DraftChild>) {
    setChildren((prev) =>
      prev.map((child, position) => (position === index ? { ...child, ...patch } : child)),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          phone: phone.trim() || null,
          note: note.trim() || null,
          children: children
            .map((child) => ({
              id: child.id,
              name: child.name.trim() || null,
              gender: child.gender === "" ? null : child.gender,
              birthday: child.birthday.trim() || null,
            }))
            .filter((child) => child.name || child.gender || child.birthday),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      onSaved(data.customer as CustomerDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this customer.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this customer? Past sales are kept.")) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      onDeleted(customer.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this customer.");
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-700 bg-slate-800/70 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-blue-300">
            Name
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Priya Sharma"
            className={inputClass}
          />
        </label>
        <label className="text-xs text-slate-400">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-blue-300">
            Phone
          </span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="98765 43210"
            inputMode="tel"
            className={inputClass}
          />
        </label>
      </div>

      <label className="block text-xs text-slate-400">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-blue-300">
          Note
        </span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Sizes she usually buys, prefers pastels…"
          className={inputClass}
        />
      </label>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-300">
          Children
        </p>
        {children.length === 0 && (
          <p className="mb-2 text-xs text-slate-500">No children captured yet.</p>
        )}
        <div className="space-y-2">
          {children.map((child, index) => (
            <div key={child.id ?? `new-${index}`} className="flex flex-wrap gap-2">
              <input
                value={child.name}
                onChange={(event) => update(index, { name: event.target.value })}
                placeholder="Child's name"
                className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500"
              />
              <select
                value={child.gender}
                onChange={(event) =>
                  update(index, { gender: event.target.value as DraftChild["gender"] })
                }
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              >
                <option value="">Not set</option>
                <option value="girl">Girl</option>
                <option value="boy">Boy</option>
              </select>
              <input
                value={child.birthday}
                onChange={(event) => update(index, { birthday: event.target.value })}
                type="date"
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 scheme-dark"
              />
              <button
                type="button"
                onClick={() => setChildren((prev) => prev.filter((_, i) => i !== index))}
                title="Remove child"
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-400 hover:bg-slate-700"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setChildren((prev) => [
              ...prev,
              { id: null, name: "", gender: "", birthday: "" },
            ])
          }
          className="mt-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-blue-300 hover:bg-slate-700"
        >
          + Add child
        </button>
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
          onClick={remove}
          disabled={saving}
          className="ml-auto rounded border border-red-900 bg-slate-900 px-3 py-1 text-xs text-red-400 hover:bg-red-950"
        >
          Delete customer
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Review panel                                                               */
/* -------------------------------------------------------------------------- */

function ReviewPanel({
  customer,
  reviewUrl,
  onUpdated,
}: {
  customer: CustomerDetail;
  reviewUrl: string;
  onUpdated: (next: CustomerDetail) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const whatsapp = whatsappReviewLink(customer, reviewUrl);
  const sms = smsReviewLink(customer, reviewUrl);

  async function setFlag(patch: { reviewRequested?: boolean; reviewed?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      onUpdated(data.customer as CustomerDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the review status.");
    } finally {
      setBusy(false);
    }
  }

  const reviewed = customer.reviewedAt !== null;
  const requested = customer.reviewRequestedAt !== null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-blue-100">Google review</h3>
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
            reviewed
              ? "bg-green-200 text-green-950"
              : requested
                ? "bg-amber-200 text-amber-950"
                : "bg-slate-800 text-slate-300"
          }`}
        >
          {reviewed ? "Reviewed" : requested ? "Asked · not done" : "Not asked"}
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-400">
        {reviewed
          ? `Left a review on ${formatDate(customer.reviewedAt)}.`
          : requested
            ? `Requested on ${formatDate(customer.reviewRequestedAt)} — no review yet.`
            : "No review request sent yet."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setFlag({ reviewRequested: true })}
            className="rounded border border-green-800 bg-slate-900 px-3 py-1 text-xs text-green-300 hover:bg-green-950"
          >
            Ask on WhatsApp
          </a>
        )}
        {sms && (
          <a
            href={sms}
            onClick={() => setFlag({ reviewRequested: true })}
            className="rounded border border-slate-700 px-3 py-1 text-xs text-blue-300 hover:bg-slate-800"
          >
            Ask by SMS
          </a>
        )}
        {!whatsapp && !sms && (
          <span className="text-xs text-slate-500">
            Add a phone number to send a review request.
          </span>
        )}
        <a
          href={reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Open review page
        </a>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFlag({ reviewed: !reviewed })}
          disabled={busy}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-60"
        >
          {reviewed ? "Mark review as pending" : "Mark review received"}
        </button>
        <button
          type="button"
          onClick={() => setFlag({ reviewRequested: !requested })}
          disabled={busy}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-60"
        >
          {requested ? "Clear 'asked' flag" : "Mark as asked"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail view                                                                */
/* -------------------------------------------------------------------------- */

function CustomerDetailPanel({
  customer,
  reviewUrl,
  onUpdated,
  onDeleted,
}: {
  customer: CustomerDetail;
  reviewUrl: string;
  onUpdated: (next: CustomerDetail) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const call = telLink(customer.phone);

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-100">
              {customer.name || "Unnamed customer"}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              {customer.phone ? (
                <a href={call ?? undefined} className="hover:text-blue-300">
                  {customer.phone}
                </a>
              ) : (
                <span>No phone</span>
              )}
              <span className="text-slate-700">·</span>
              <span>Added {formatDate(customer.createdAt)}</span>
            </div>
            {customer.note && (
              <p className="mt-2 rounded border border-slate-800 bg-slate-950/60 p-2 text-xs text-slate-300">
                {customer.note}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="rounded border border-slate-700 px-3 py-1 text-xs text-blue-300 hover:bg-slate-800"
          >
            {editing ? "Close" : "Edit details"}
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Purchases", String(customer.visits)],
            ["Lifetime value", money(customer.totalSpend)],
            ["Last visit", relativeVisit(customer.lastPurchaseAt)],
            ["First visit", formatDate(customer.firstPurchaseAt)],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-slate-800 bg-slate-950/60 p-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-blue-300">
                {label}
              </dt>
              <dd className="mt-0.5 text-sm text-slate-100">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex flex-wrap gap-2">
          {customer.children.length === 0 ? (
            <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400">
              No children captured
            </span>
          ) : (
            customer.children.map((child) => {
              const age = ageFromBirthday(child.birthday);
              return (
                <span
                  key={child.id}
                  className="rounded bg-slate-800 px-2 py-1 text-xs text-blue-100"
                >
                  {child.name || "Child"}
                  {child.gender === "girl" ? " · girl" : child.gender === "boy" ? " · boy" : ""}
                  {child.birthday
                    ? ` · 🎂 ${birthdayLabel(child.birthday)}${
                        age !== null ? ` (${age} yrs)` : ""
                      }`
                    : ""}
                </span>
              );
            })
          )}
        </div>

        {editing && (
          <CustomerEditor
            customer={customer}
            onSaved={(next) => {
              onUpdated(next);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
            onDeleted={onDeleted}
          />
        )}
      </div>

      <ReviewPanel customer={customer} reviewUrl={reviewUrl} onUpdated={onUpdated} />

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 text-sm font-semibold text-blue-100">
          Purchase history
          <span className="ml-2 font-normal text-slate-400">
            {customer.sales.length} order{customer.sales.length === 1 ? "" : "s"}
          </span>
        </h3>

        {customer.sales.length === 0 ? (
          <p className="text-sm text-slate-400">
            No sales recorded against this phone number yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {customer.sales.map((sale) => (
              <li
                key={sale.id}
                className="rounded border border-slate-800 bg-slate-950/60 p-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-100">{formatDate(sale.soldAt)}</span>
                  <span className="text-xs text-slate-400">
                    {sale.externalId}
                    {sale.totalAmount ? ` · ${money(sale.totalAmount)}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300">{saleItemsLine(sale)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* CRM shell                                                                  */
/* -------------------------------------------------------------------------- */

export default function CustomerCrm({ initial, reviewUrl }: Props) {
  const [customers, setCustomers] = useState<CustomerRecord[]>(initial);
  const [query, setQuery] = useState("");
  const [reviewDueOnly, setReviewDueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [adding, setAdding] = useState(initial.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setDetail(null);
    fetch(`/api/customers/${selectedId}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        return data.customer as CustomerDetail;
      })
      .then((customer) => {
        if (!cancelled) setDetail(customer);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load this customer.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  /** Writes a freshly saved customer back into the list (without `sales`). */
  const upsert = useCallback((next: CustomerDetail) => {
    const record: CustomerRecord = {
      id: next.id,
      name: next.name,
      phone: next.phone,
      note: next.note,
      visits: next.visits,
      totalSpend: next.totalSpend,
      firstPurchaseAt: next.firstPurchaseAt,
      lastPurchaseAt: next.lastPurchaseAt,
      children: next.children,
      reviewRequestedAt: next.reviewRequestedAt,
      reviewedAt: next.reviewedAt,
      createdAt: next.createdAt,
    };
    setDetail(next);
    setCustomers((prev) => {
      const exists = prev.some((row) => row.id === record.id);
      const list = exists
        ? prev.map((row) => (row.id === record.id ? record : row))
        : [record, ...prev];
      return list.sort((a, b) =>
        (b.lastPurchaseAt ?? b.createdAt).localeCompare(a.lastPurchaseAt ?? a.createdAt),
      );
    });
  }, []);

  const removeFromList = useCallback((id: string) => {
    setCustomers((prev) => prev.filter((row) => row.id !== id));
    setSelectedId((current) => (current === id ? null : current));
    setDetail(null);
  }, []);

  const visible = useMemo(
    () =>
      customers.filter(
        (customer) =>
          matchesQuery(customer, query) && (!reviewDueOnly || customer.reviewedAt === null),
      ),
    [customers, query, reviewDueOnly],
  );

  const dueCount = useMemo(
    () => customers.filter((customer) => customer.reviewedAt === null && customer.visits > 0).length,
    [customers],
  );

  async function addCustomer(form: {
    name: string;
    phone: string;
    note: string;
  }): Promise<void> {
    setError(null);
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim() || null,
          phone: form.phone.trim() || null,
          note: form.note.trim() || null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      const customer = data.customer as CustomerDetail;
      upsert(customer);
      setSelectedId(customer.id);
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add this customer.");
      throw e;
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {/* ---------------------------------------------------------------- */}
      {/* List                                                             */}
      {/* ---------------------------------------------------------------- */}
      <aside className="space-y-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone or child"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <label className="flex items-center gap-1 text-slate-300">
              <input
                type="checkbox"
                checked={reviewDueOnly}
                onChange={(event) => setReviewDueOnly(event.target.checked)}
                className="h-3 w-3 accent-blue-500"
              />
              Review pending ({dueCount})
            </label>
            <span className="text-slate-500">{visible.length} shown</span>
          </div>
          <button
            type="button"
            onClick={() => setAdding((value) => !value)}
            className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-blue-300 hover:bg-slate-800"
          >
            {adding ? "Close" : "+ Add customer"}
          </button>

          {adding && (
            <AddCustomerForm onSubmit={addCustomer} onCancel={() => setAdding(false)} />
          )}
        </div>

        {error && (
          <p className="rounded border border-red-900 bg-red-950/60 p-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <ul className="max-h-128 space-y-1 overflow-y-auto pr-1">
          {visible.length === 0 && (
            <li className="rounded border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">
              No customers match. Add one above, or record a sale in the extension to
              create them automatically.
            </li>
          )}
          {visible.map((customer) => {
            const due = customer.reviewedAt === null;
            const active = customer.id === selectedId;
            return (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(customer.id)}
                  className={`w-full rounded border px-3 py-2 text-left ${
                    active
                      ? "border-blue-500 bg-slate-800"
                      : "border-slate-800 bg-slate-900 hover:bg-slate-800/70"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-100">
                      {customer.name || customer.phone || "Unnamed"}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {customer.visits} visit{customer.visits === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                    <span className="tabular-nums">{customer.phone || "no phone"}</span>
                    <span className="text-slate-700">·</span>
                    <span>{relativeVisit(customer.lastPurchaseAt)}</span>
                    {customer.children.length > 0 && (
                      <span className="rounded bg-slate-800 px-1.5 text-blue-200">
                        {customer.children.length} child
                        {customer.children.length === 1 ? "" : "ren"}
                      </span>
                    )}
                    {due ? (
                      <span className="rounded bg-amber-200 px-1.5 font-medium text-amber-950">
                        review due
                      </span>
                    ) : (
                      <span className="rounded bg-green-200 px-1.5 font-medium text-green-950">
                        reviewed
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* Detail                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div>
        {loadingDetail && (
          <p className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
            Loading customer…
          </p>
        )}
        {!loadingDetail && detail && (
          <CustomerDetailPanel
            customer={detail}
            reviewUrl={reviewUrl}
            onUpdated={upsert}
            onDeleted={removeFromList}
          />
        )}
        {!loadingDetail && !detail && (
          <p className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
            Select a customer to see their children, purchase history and review status.
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Add form                                                                   */
/* -------------------------------------------------------------------------- */

function AddCustomerForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (form: { name: string; phone: string; note: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim() && !phone.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ name, phone, note });
      setName("");
      setPhone("");
      setNote("");
    } catch {
      // The parent shows the error message.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded border border-slate-700 bg-slate-950/70 p-2">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        className={inputClass}
      />
      <input
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="Phone (used to match sales)"
        inputMode="tel"
        className={inputClass}
      />
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        className={inputClass}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || (!name.trim() && !phone.trim())}
          className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
