import { authenticateRequest } from "@/lib/apiAuth";
import { createCustomer, listCustomers } from "@/lib/customers";
import type { CreateCustomerRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/customers?q=<name or phone>
 * The CRM list: every customer with visit count, spend, children, and whether
 * their Google review is still due.
 */
export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const search = new URL(request.url).searchParams.get("q") ?? undefined;

  try {
    const customers = await listCustomers(search);
    return Response.json({ customers });
  } catch (e) {
    console.error("GET /api/customers error:", e);
    return Response.json({ error: "Customers could not be loaded." }, { status: 500 });
  }
}

/**
 * POST /api/customers
 * Adds a customer. Phone is the natural key — creating one that already exists
 * merges the name/note and returns the existing record.
 */
export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateCustomerRequest;
  try {
    body = (await request.json()) as CreateCustomerRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const hasName = typeof body?.name === "string" && body.name.trim() !== "";
  const hasPhone = typeof body?.phone === "string" && body.phone.trim() !== "";
  if (!hasName && !hasPhone) {
    return Response.json(
      { error: "Provide at least a name or a phone number." },
      { status: 400 },
    );
  }

  if (body.children !== undefined && !Array.isArray(body.children)) {
    return Response.json({ error: "Field 'children' must be an array." }, { status: 400 });
  }

  try {
    const customer = await createCustomer(body);
    if (!customer) {
      return Response.json({ error: "Customer could not be created." }, { status: 500 });
    }
    return Response.json({ customer }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Customer could not be created.";
    const known = message.includes("name or a phone");
    console.error("POST /api/customers error:", e);
    return Response.json({ error: message }, { status: known ? 400 : 500 });
  }
}
