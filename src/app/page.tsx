"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import FileUploader from "@/components/FileUploader";
import LabelConfigPanel from "@/components/LabelConfigPanel";
import JobHistory from "@/components/JobHistory";
import PrintReminder from "@/components/PrintReminder";
import { parseFile } from "@/lib/fileProcessor";
import { generatePdf } from "@/lib/pdfGenerator";
import { generateZpl } from "@/lib/zplGenerator";
import { DEFAULT_LAYOUT } from "@/lib/constants";
import type { ProductRecord, LabelConfig, LabelElement } from "@/lib/types";

const DEFAULT_CONFIG: LabelConfig = {
  includeProductName: true,
  includeSku: true,
  outputMode: "pdf",
  dpi: 203,
  layout: DEFAULT_LAYOUT,
};

export default function Home() {
  // File parsing state
  const [records, setRecords] = useState<ProductRecord[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Config state
  const [config, setConfig] = useState<LabelConfig>(DEFAULT_CONFIG);

  // Load saved layout from designer on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("labelLayout");
      if (saved) {
        const layout = JSON.parse(saved) as LabelElement[];
        setConfig((prev) => ({
          ...prev,
          layout,
          includeProductName: layout.some(
            (el) => el.type === "productName" && el.visible,
          ),
          includeSku: layout.some((el) => el.type === "sku" && el.visible),
        }));
      }
    } catch {
      // ignore invalid localStorage data
    }
  }, []);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [zplOutput, setZplOutput] = useState<string | null>(null);
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Counter to trigger JobHistory refresh after a successful job save
  const [jobSavedCounter, setJobSavedCounter] = useState(0);

  // Ref to revoke previous blob URL
  const prevPdfUrl = useRef<string | null>(null);

  const handleFileAccepted = useCallback(async (file: File) => {
    // Reset all state
    setUploadError(null);
    setParseWarnings([]);
    setParseErrors([]);
    setRecords([]);
    setPdfUrl(null);
    setZplOutput(null);
    setGenerationWarnings([]);
    setGenerationError(null);
    setFileName(file.name);

    // Revoke previous blob URL
    if (prevPdfUrl.current) {
      URL.revokeObjectURL(prevPdfUrl.current);
      prevPdfUrl.current = null;
    }

    const result = await parseFile(file);
    setRecords(result.records);
    setParseWarnings(result.warnings);
    setParseErrors(result.errors);
  }, []);

  const handleFileError = useCallback((message: string) => {
    setUploadError(message);
    setRecords([]);
    setParseWarnings([]);
    setParseErrors([]);
    setPdfUrl(null);
    setZplOutput(null);
    setGenerationWarnings([]);
    setGenerationError(null);
    setFileName(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenerationError(null);
    setGenerationWarnings([]);
    setPdfUrl(null);
    setZplOutput(null);
    setCopied(false);

    // Revoke previous blob URL
    if (prevPdfUrl.current) {
      URL.revokeObjectURL(prevPdfUrl.current);
      prevPdfUrl.current = null;
    }

    let generatedRecordCount = records.length;

    try {
      if (config.outputMode === "pdf") {
        console.log("[PAGE] calling generatePdf with", records.length, "records");
        const result = await generatePdf({ records, config });
        console.log("[PAGE] generatePdf returned, blob size:", result.blob.size);
        const url = URL.createObjectURL(result.blob);
        prevPdfUrl.current = url;
        setPdfUrl(url);
        setGenerationWarnings(result.warnings);
        generatedRecordCount = records.length - result.warnings.length;

        // Auto-trigger download
        const downloadName = `${(fileName ?? "labels").replace(/\.[^.]+$/, "")}.pdf`;
        console.log("[PAGE] triggering download:", downloadName);
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log("[PAGE] download triggered");
      } else {
        const result = generateZpl({ records, config, dpi: config.dpi });
        setZplOutput(result.zpl);
        setGenerationWarnings(result.warnings);
        generatedRecordCount = records.length - result.warnings.length;
      }
    } catch (err) {
      console.error("[PAGE] Generation failed:", err);
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setGenerationError(message);
    }

    // Save job metadata regardless of generation outcome so the attempt is recorded
    if (generatedRecordCount > 0) {
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: fileName ?? "unknown",
            rowCount: generatedRecordCount,
          }),
        });
        if (!res.ok) {
          console.warn("Job save returned non-OK status:", res.status);
        } else {
          // Trigger JobHistory refresh
          setJobSavedCounter((c) => c + 1);
        }
      } catch (fetchErr) {
        console.warn("Job save request failed:", fetchErr);
      }
    }

    setGenerating(false);
  }, [config, records, fileName]);

  const handleCopyZpl = useCallback(async () => {
    if (!zplOutput) return;
    try {
      await navigator.clipboard.writeText(zplOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  }, [zplOutput]);

  const handleDownloadZpl = useCallback(() => {
    if (!zplOutput) return;
    const blob = new Blob([zplOutput], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(fileName ?? "labels").replace(/\.[^.]+$/, "")}.zpl`;
    a.click();
    URL.revokeObjectURL(url);
  }, [zplOutput, fileName]);

  const hasRecords = records.length > 0;
  const hasErrors = parseErrors.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-8 text-2xl font-bold text-gray-900">
          Barcode Label Generator
        </h1>

        {/* Upload Section */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Upload File
          </h2>
          <FileUploader
            onFileAccepted={handleFileAccepted}
            onError={handleFileError}
          />
          {uploadError && (
            <p className="mt-2 text-sm text-red-600">{uploadError}</p>
          )}
        </section>

        {/* Parse Results */}
        {(hasRecords || parseWarnings.length > 0 || hasErrors) && (
          <section className="mb-6 rounded border border-gray-200 bg-white p-4">
            {hasRecords && (
              <p className="text-sm text-green-700">
                ✓ {records.length} record{records.length !== 1 ? "s" : ""} parsed
                successfully
              </p>
            )}
            {parseWarnings.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium text-yellow-700">Warnings:</p>
                <ul className="ml-4 list-disc text-sm text-yellow-600">
                  {parseWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {hasErrors && (
              <div className="mt-2">
                <p className="text-sm font-medium text-red-700">Errors:</p>
                <ul className="ml-4 list-disc text-sm text-red-600">
                  {parseErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Configuration Section */}
        {hasRecords && !hasErrors && (
          <section className="mb-6 rounded border border-gray-200 bg-white p-4">
            <LabelConfigPanel
              config={config}
              onChange={setConfig}
              zplEnabled={true}
            />
          </section>
        )}

        {/* Generate Button */}
        {hasRecords && !hasErrors && (
          <section className="mb-6">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate"}
            </button>
          </section>
        )}

        {/* Generation Error */}
        {generationError && (
          <section className="mb-6 rounded border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{generationError}</p>
            <button
              onClick={handleGenerate}
              className="mt-2 rounded bg-red-600 px-4 py-1 text-sm text-white hover:bg-red-700"
            >
              Retry
            </button>
          </section>
        )}

        {/* Generation Warnings */}
        {generationWarnings.length > 0 && (
          <section className="mb-6 rounded border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm font-medium text-yellow-700">
              Generation Warnings:
            </p>
            <ul className="ml-4 list-disc text-sm text-yellow-600">
              {generationWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </section>
        )}

        {/* PDF Output */}
        {pdfUrl && (
          <section className="mb-6 rounded border border-green-200 bg-green-50 p-4">
            <p className="mb-2 text-sm font-medium text-green-700">
              PDF generated successfully!
            </p>
            <a
              href={pdfUrl}
              download={`${(fileName ?? "labels").replace(/\.[^.]+$/, "")}.pdf`}
              className="inline-block rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Download PDF
            </a>
          </section>
        )}

        {/* Print Reminder — shown only for PDF output */}
        <section className="mb-6">
          <PrintReminder visible={pdfUrl !== null && config.outputMode === "pdf"} />
        </section>

        {/* ZPL Output */}
        {zplOutput && (
          <section className="mb-6 rounded border border-green-200 bg-green-50 p-4">
            <p className="mb-2 text-sm font-medium text-green-700">
              ZPL generated successfully!
            </p>
            <div className="mb-3 flex gap-2">
              <button
                onClick={handleCopyZpl}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
              <button
                onClick={handleDownloadZpl}
                className="rounded border border-green-600 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
              >
                Download ZPL
              </button>
            </div>
            <pre className="max-h-60 overflow-auto rounded bg-gray-900 p-3 text-xs text-green-300">
              {zplOutput}
            </pre>
          </section>
        )}

        {/* Job History */}
        <section className="mt-8 border-t border-gray-200 pt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            Job History
          </h2>
          <JobHistory refreshKey={jobSavedCounter} />
        </section>
      </div>
    </div>
  );
}
