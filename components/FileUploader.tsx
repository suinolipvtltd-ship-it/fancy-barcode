"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";

interface FileUploaderProps {
  onFile: (file: File) => void;
  filename: string | null;
  error: string | null;
}

const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

export default function FileUploader({ onFile, filename, error }: FileUploaderProps) {
  const [extensionError, setExtensionError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    const valid = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));

    if (!valid) {
      setExtensionError(
        "Unsupported file type. Please upload a .csv or .xlsx file."
      );
      return;
    }

    setExtensionError(null);
    onFile(file);
  }

  // Inline extension error takes priority; then the error prop from parent
  const displayError = extensionError ?? error;

  return (
    <div className="no-print space-y-2">
      <Input
        type="file"
        accept=".csv,.xlsx"
        onChange={handleChange}
      />

      {displayError ? (
        <Alert variant="destructive">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      ) : filename ? (
        <p className="text-sm text-muted-foreground">Selected: {filename}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Upload a .csv or .xlsx file with Left_Value and Right_Value columns
        </p>
      )}
    </div>
  );
}
