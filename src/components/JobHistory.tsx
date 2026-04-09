"use client";

import { useState, useEffect } from "react";
import type { JobRecord } from "@/lib/types";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString();
}

export default function JobHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchJobs() {
      try {
        const res = await fetch("/api/jobs");
        const data = await res.json();

        if (cancelled) return;

        // The GET route returns JobRecord[] on success,
        // or { jobs: [], message: "..." } on DB error (still 200).
        if (Array.isArray(data)) {
          setJobs(data);
        } else if (data.message) {
          setError(data.message);
          setJobs([]);
        } else {
          setJobs([]);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load job history");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchJobs();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <div data-testid="job-history-loading" className="text-gray-500">
        Loading job history…
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="job-history-error" className="text-red-600">
        {error}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div data-testid="job-history-empty" className="text-gray-500">
        No previous jobs
      </div>
    );
  }

  return (
    <ul data-testid="job-history-list" className="space-y-2">
      {jobs.map((job) => (
        <li
          key={job.id}
          data-testid="job-history-item"
          className="rounded border border-gray-200 p-3"
        >
          <div className="font-medium">{job.fileName}</div>
          <div className="text-sm text-gray-600">
            {job.rowCount} {job.rowCount === 1 ? "row" : "rows"} · {formatTimestamp(job.createdAt)}
          </div>
        </li>
      ))}
    </ul>
  );
}
