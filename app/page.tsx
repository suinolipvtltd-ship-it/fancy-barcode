"use client";

import { useState } from "react";
import type { LabelRow } from "@/lib/types";
import { parseCSV } from "@/lib/parseCSV";
import { parseExcel } from "@/lib/parseExcel";
import FileUploader from "@/components/FileUploader";
import DataPreviewTable from "@/components/DataPreviewTable";
import LabelRenderer from "@/components/LabelRenderer";
import { Button } from "@/components/ui/button";

type AppState = {
  rows: LabelRow[];
  error: string | null;
  filename: string | null;
};

export default function Home() {
  const [state, setState] = useState<AppState>({
    rows: [],
    error: null,
    filename: null,
  });

  async function handleFile(file: File) {
    // Reset state before parsing
    setState({ rows: [], error: null, filename: file.name });

    const ext = file.name.toLowerCase().split(".").pop();
    let result;

    if (ext === "csv") {
      result = await parseCSV(file);
    } else if (ext === "xlsx") {
      result = await parseExcel(file);
    } else {
      setState({ rows: [], error: "Unsupported file type.", filename: file.name });
      return;
    }

    if (result.ok) {
      setState({ rows: result.rows, error: null, filename: file.name });
    } else {
      setState({ rows: [], error: result.error, filename: file.name });
    }
  }

  return (
    <div>
      <div className="no-print p-4 space-y-4">
        <h1 className="text-xl font-bold">CSV / Excel QR Label Generator</h1>
        <FileUploader
          onFile={handleFile}
          filename={state.filename}
          error={state.error}
        />
        {state.rows.length > 0 && (
          <DataPreviewTable rows={state.rows} />
        )}
        <Button
          className="no-print"
          disabled={state.rows.length === 0}
          onClick={() => window.print()}
        >
          Print Labels
        </Button>
      </div>
      {state.rows.length > 0 && (
        <LabelRenderer rows={state.rows} />
      )}
    </div>
  );
}
