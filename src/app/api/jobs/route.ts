import { getDb } from "@/lib/db";
import type { CreateJobRequest, JobRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateJobRequest;

    if (
      !body.fileName ||
      typeof body.fileName !== "string" ||
      typeof body.rowCount !== "number" ||
      !Number.isFinite(body.rowCount) ||
      body.rowCount < 0
    ) {
      return Response.json(
        { error: "Invalid request: fileName (string) and rowCount (number >= 0) are required." },
        { status: 400 }
      );
    }

    const sql = getDb();
    const rows = await sql`
      INSERT INTO jobs (file_name, row_count)
      VALUES (${body.fileName}, ${body.rowCount})
      RETURNING id, file_name, row_count, created_at
    `;

    const row = rows[0];
    const job: JobRecord = {
      id: row.id,
      fileName: row.file_name,
      rowCount: row.row_count,
      createdAt: new Date(row.created_at).toISOString(),
    };

    return Response.json(job, { status: 201 });
  } catch (e) {
    console.error("POST /api/jobs error:", e);
    return Response.json(
      { warning: "Job history could not be saved." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, file_name, row_count, created_at
      FROM jobs
      ORDER BY created_at DESC
    `;

    const jobs: JobRecord[] = rows.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      rowCount: row.row_count,
      createdAt: new Date(row.created_at).toISOString(),
    }));

    return Response.json(jobs);
  } catch (e) {
    console.error("GET /api/jobs error:", e);
    return Response.json(
      { jobs: [], message: "Unable to load job history." },
      { status: 200 }
    );
  }
}
