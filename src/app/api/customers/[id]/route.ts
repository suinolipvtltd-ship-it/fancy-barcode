import { authenticateRequest } from "@/lib/apiAuth";
import { getDb } from "@/lib/db";
import { getCustomer, updateCustomer } from "@/lib/customers";
import type { UpdateCustomerRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/customers/[id] — the customer plus their purchase history. */
export async function GET(request: Request, ctx: RouteContext) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const customer = await getCustomer(id);
    if (!customer) {
      return Response.json({ error: "Customer not found." }, { status: 404 });
    }
    return Response.json({ customer });
  } catch (e) {
    console.error("GET /api/customers/[id] error:", e);
    return Response.json({ error: "Customer could not be loaded." }, { status: 500 });
  }
}

/**
 * PATCH /api/customers/[id]
 * Edits the contact details, replaces the list of children when `children` is
 * sent, and records review-request / review-received timestamps.
 */
export async function PATCH(request: Request, ctx: RouteContext) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  let body: UpdateCustomerRequest;
  try {
    body = (await request.json()) as UpdateCustomerRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.children !== undefined && !Array.isArray(body.children)) {
    return Response.json({ error: "Field 'children' must be an array." }, { status: 400 });
  }

  for (const child of Array.isArray(body.children) ? body.children : []) {
    if (child.gender !== undefined && child.gender !== null && child.gender !== "girl" && child.gender !== "boy") {
      return Response.json(
        { error: "Child 'gender' must be 'girl', 'boy' or null." },
        { status: 400 },
      );
    }
    if (
      child.birthday !== undefined &&
      child.birthday !== null &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(child.birthday))
    ) {
      return Response.json(
        { error: "Child 'birthday' must be YYYY-MM-DD or null." },
        { status: 400 },
      );
    }
  }

  try {
    const customer = await updateCustomer(id, body);
    if (!customer) {
      return Response.json({ error: "Customer not found." }, { status: 404 });
    }
    return Response.json({ customer });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Customer could not be saved.";
    const conflict = message.includes("already uses that phone");
    console.error("PATCH /api/customers/[id] error:", e);
    return Response.json({ error: message }, { status: conflict ? 409 : 500 });
  }
}

/**
 * DELETE /api/customers/[id]
 * Removes the CRM record. Past sales are kept — their `customer_id` becomes
 * NULL, so turnover figures stay intact.
 */
export async function DELETE(request: Request, ctx: RouteContext) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const sql = getDb();
    const rows = await sql`DELETE FROM customers WHERE id = ${id} RETURNING id`;
    if (!rows[0]) {
      return Response.json({ error: "Customer not found." }, { status: 404 });
    }
    return Response.json({ id, deleted: true });
  } catch (e) {
    console.error("DELETE /api/customers/[id] error:", e);
    return Response.json({ error: "Customer could not be deleted." }, { status: 500 });
  }
}
