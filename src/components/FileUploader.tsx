"use client";

import { useState, useRef, useCallback } from "react";

export interface FileUploaderProps {
  onFileAccepted: (file: File) => void;
  onError: (message: string) => void;
}

const ACCEPTED_EXTENSIONS = [".xlsx", ".csv"];

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return "";
  return fileName.slice(dotIndex).toLowerCase();
}

function isAcceptedFile(fileName: string): boolean {
  return ACCEPTED_EXTENSIONS.includes(getFileExtension(fileName));
}

export default function FileUploader({
  onFileAccepted,
  onError,
}: FileUploaderProps) {
  const [acceptedFileName, setAcceptedFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (isAcceptedFile(file.name)) {
        setAcceptedFileName(file.name);
        onFileAccepted(file);
      } else {
        setAcceptedFileName(null);
        onError(
          "Unsupported file type. Please upload a .xlsx or .csv file."
        );
      }
    },
    [onFileAccepted, onError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(true);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  return (
    <div
      data-testid="file-uploader"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
        isDragOver
          ? "border-blue-500 bg-blue-50"
          : acceptedFileName
            ? "border-green-500 bg-green-50"
            : "border-gray-300 hover:border-gray-400"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        onChange={handleInputChange}
        className="hidden"
        data-testid="file-input"
        aria-label="Upload file"
      />

      {acceptedFileName ? (
        <div className="flex items-center gap-2 text-green-700" data-testid="file-accepted">
          <span aria-hidden="true">✓</span>
          <span>{acceptedFileName}</span>
        </div>
      ) : (
        <p className="text-gray-500" data-testid="instructional-text">
          Drag and drop an .xlsx or .csv file here, or click to browse
        </p>
      )}
    </div>
  );
}

export { isAcceptedFile, getFileExtension };
