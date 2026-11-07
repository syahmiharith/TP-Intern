"use client";
import { readBatch, writeBatch, expensesCsv, sampleReceipt } from "@/lib/expense-workflow";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  AlertCircle,
  Save,
  FileText,
  RotateCcw,
  Download,
  FileJson,
  FlaskConical,
  Square,
  Sparkles,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  FileImage,
  Plus,
  Trash2,
  X
} from "lucide-react";
import clsx from "clsx";
import {
  ReceiptExtraction,
  ReceiptFormValues,
  allowedReceiptImageTypes,
  emptyReceiptForm,
  extractionToFormValues,

  isExtractionComplete,
  maxReceiptImageSizeBytes,
  receiptTypes,
  validateReceiptForm
} from "@/lib/receipt";

type QueueStatus = "ready" | "extracting" | "extracted" | "needs-review" | "failed" | "edited";
type FieldErrors = Partial<Record<keyof ReceiptFormValues, string>>;

export type ReceiptQueueItem = {
  id: string;
  savedValues?: ReceiptFormValues;
  reviewedAt?: string;
  editedAt?: number;
  extractedAt?: string;
  requestId?: string;
  file: File;
  previewUrl: string;
  selected: boolean;
  expanded: boolean;
  status: QueueStatus;
  progress: number;
  extraction: ReceiptExtraction | null;
  formValues: ReceiptFormValues;
  errors: FieldErrors;
  errorMessage: string | null;
  isNewResult: boolean;
  resultSeen: boolean;
};

type ExtractApiResponse = {
  data?: ReceiptExtraction;
  extractedAt?: string;
  requestId?: string;
  code?: string;
  error?: string;
};

const maxFiles = 5;
const extractableStatuses: QueueStatus[] = ["ready", "failed"];

function createQueueItemId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatFileSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function formatSummary(item: ReceiptQueueItem) {
  if (item.status === "ready") return "Waiting for extraction";
  if (item.status === "extracting") return "Reading receipt fields...";
  if (item.status === "failed") return item.errorMessage ?? "Extraction failed. Try again.";

  const merchant = item.formValues.merchantName.trim() || "Unknown merchant";
  const currency = item.formValues.currency.trim().toUpperCase() || "—";
  const total = item.formValues.totalAmount.trim() ? Number(item.formValues.totalAmount).toFixed(2) : "—";
  const date = item.formValues.date.trim() || "—";

  return `${merchant} · ${currency} ${total} · ${date}`;
}

function statusLabel(item: ReceiptQueueItem) {
  if (isCompleteItem(item)) return "Reviewed";
  if (item.extraction && JSON.stringify(item.savedValues) !== JSON.stringify(item.formValues)) return "Unsaved changes";
  if (item.status === "extracted" && item.extraction) return `Extracted · ${item.extraction.confidence}`;
  if (item.status === "needs-review") return "Needs review";
  return item.status[0].toUpperCase() + item.status.slice(1);
}

function isCompleteItem(item: ReceiptQueueItem) {
  return Boolean(item.reviewedAt && item.savedValues && JSON.stringify(item.savedValues) === JSON.stringify(item.formValues) && Object.keys(validateReceiptForm(item.formValues)).length === 0);
}

function buildDownloadPayload(item: ReceiptQueueItem) {
  if (!item.extraction) return null;

  return { schemaVersion: 1, receiptId: item.id, fileName: item.file.name,
    extractedAt: item.extractedAt, requestId: item.requestId,
    originalExtraction: item.extraction, reviewedValues: item.savedValues,
    reviewedAt: item.reviewedAt, confidence: item.extraction.confidence };

}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
  tone = "neutral"
}: {
  label: string;
  children: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  tone?: "neutral" | "preview" | "download" | "delete" | "expand";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35",
        tone === "neutral" && "hover:bg-slate-100 hover:text-slate-950 focus:ring-blue-500",
        tone === "preview" && "hover:bg-blue-50 hover:text-blue-700 hover:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] focus:ring-blue-500",
        tone === "download" && "hover:bg-emerald-50 hover:text-emerald-700 hover:shadow-[0_0_0_3px_rgba(16,185,129,0.14)] focus:ring-emerald-500",
        tone === "delete" && "hover:bg-rose-50 hover:text-rose-700 hover:shadow-[0_0_0_3px_rgba(244,63,94,0.14)] focus:ring-rose-500",
        tone === "expand" && "hover:bg-slate-100 hover:text-blue-700 focus:ring-blue-500"
      )}
    >
      {children}
    </button>
  );
}

function UploadDropzone({
  canAddMore,
  compact,
  onFiles
}: {
  canAddMore: boolean;
  compact?: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  const inputId = compact ? "receipt-add-upload" : "receipt-upload";

  return (
    <section className={clsx(compact ? "w-auto" : "mx-auto w-full max-w-3xl")}>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        disabled={!canAddMore}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <label
        htmlFor={inputId}
        className={clsx(
          "cursor-pointer border-slate-200 bg-white text-center transition hover:border-blue-400 hover:bg-blue-50 focus-within:ring-2 focus-within:ring-blue-500",
          compact
            ? "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold text-slate-700 hover:text-blue-700"
            : "flex min-h-56 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-10 shadow-soft",
          !canAddMore && "pointer-events-none opacity-50"
        )}
      >
        {compact ? (
          <Plus className="h-4 w-4" aria-hidden="true" />
        ) : (
          <FileImage className="mb-5 h-12 w-12 text-blue-600" aria-hidden="true" />
        )}
        <span className={clsx("font-bold", compact ? "text-sm" : "text-xl text-slate-950")}>
          {compact ? "Add files" : "Upload receipt files"}
        </span>
        {!compact ? (
          <>
            <span className="mt-3 text-sm text-slate-500">JPG, PNG, WEBP · Max 5 files</span>
            <span className="mt-1 text-sm text-slate-500">5MB per file</span>
          </>
        ) : null}
      </label>
    </section>
  );
}

function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="truncate text-sm font-bold text-slate-950">Receipt-to-Form</p>
      </div>
    </header>
  );
}

function AddFileButton({ canAddMore, onFiles }: { canAddMore: boolean; onFiles: (files: FileList | null) => void }) {
  return (
    <UploadDropzone canAddMore={canAddMore} compact onFiles={onFiles} />
  );
}

function ReceiptPreviewModal({ item, onClose }: { item: ReceiptQueueItem; onClose: () => void }) {
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key === "Tab") {
        const dialog = dialogRef.current;
        const buttons = dialog?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!dialog?.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title" ref={dialogRef}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="receipt-preview-title" className="text-lg font-bold text-slate-950">Receipt Preview</h2>
          <button onClick={() => setRotation((value) => value + 90)}>Rotate</button>
          <button onClick={() => setZoom((value) => value === 1 ? 2 : 1)}>Toggle zoom</button>
          <IconButton label="Close preview" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
        <div className="max-h-[70vh] overflow-auto p-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- Blob preview URLs cannot be optimized by next/image. */}
          <img src={item.previewUrl} style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }} alt={`Preview of ${item.file.name}`} className="mx-auto max-h-[58vh] w-auto rounded-xl border border-slate-200 object-contain" />
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-semibold text-slate-500">Filename</dt>
              <dd className="mt-1 break-all text-slate-950">{item.file.name}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Size</dt>
              <dd className="mt-1 text-slate-950">{formatFileSize(item.file.size)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Type</dt>
              <dd className="mt-1 text-slate-950">{item.file.type || "Image"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function ExpandedReceiptDetails({
  item,
  onFieldChange
}: {
  item: ReceiptQueueItem;
  onFieldChange: (id: string, field: keyof ReceiptFormValues, value: string) => void;
}) {
  const [showImage, setShowImage] = useState(false);

  useEffect(() => {
    if (Object.keys(item.errors).length) setShowImage(false);
  }, [item.errors]);

  return (
    <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
      <button className="lg:hidden" aria-pressed={showImage} onClick={() => setShowImage((value) => !value)}>{showImage ? <FileText className="mr-1 inline h-4 w-4" aria-hidden="true" /> : <Eye className="mr-1 inline h-4 w-4" aria-hidden="true" />}{showImage ? "Show form" : "Show receipt image"}</button>
      <h3 className="text-sm font-bold text-slate-950">Receipt Details</h3>


      <div className={clsx("mt-2 grid gap-3", "lg:grid-cols-[minmax(0,1fr)_18rem]")}>
        <div className={clsx("lg:block", showImage && "hidden")}>
          <div className="grid gap-2 lg:grid-cols-2">
            <EditableField item={item} field="merchantName" label="Merchant Name" onFieldChange={onFieldChange} />
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-700">Receipt Type</span>
              <select
                id={`${item.id}-receiptType`}
                aria-label="Receipt Type"
                value={item.formValues.receiptType}
                onChange={(event) => onFieldChange(item.id, "receiptType", event.target.value)}
                aria-invalid={Boolean(item.errors.receiptType)}
                className={clsx(
                  "w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100",
                  item.errors.receiptType ? "border-rose-300 bg-rose-50" : "border-slate-200"
                )}
              >
                <option value="">Select type</option>
                {receiptTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {item.errors.receiptType ? <p className="text-xs font-medium text-rose-600">{item.errors.receiptType}</p> : null}
            </label>
          </div>

          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            <EditableField item={item} field="currency" label="Currency" onFieldChange={onFieldChange} />
            <EditableField item={item} field="totalAmount" label="Total Amount" type="number" onFieldChange={onFieldChange} />
            <EditableField item={item} field="date" label="Date" type="date" onFieldChange={onFieldChange} />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-slate-700">Extraction</p>
              <p className="mt-1 text-sm capitalize text-slate-600">{item.extraction?.confidence ?? "Not extracted"} confidence</p>
            </div>
            {item.extraction?.notes.length && item.extraction.notes.join("\n") !== item.formValues.notes ? <div>
              <p className="text-xs font-semibold text-slate-700">Original notes</p>
              {item.extraction?.notes.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                  {item.extraction.notes.map((note, index) => (
                    <li key={`${note}-${index}`}>{note}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-500">No notes.</p>
              )}
            </div> : null}
          </div>

          <div className="mt-3 space-y-1">
            <label className="block text-xs font-semibold text-slate-700" htmlFor={`${item.id}-notes`}>Notes</label>
            <textarea
              id={`${item.id}-notes`}
              value={item.formValues.notes}
              onChange={(event) => onFieldChange(item.id, "notes", event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          {item.extraction?.items.length ? <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold text-slate-700">Extracted Items</p>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5">Item</th>
                    <th className="w-20 px-3 py-1.5">Qty</th>
                    <th className="w-28 px-3 py-1.5">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {item.extraction?.items.length ? (
                    item.extraction.items.map((lineItem, index) => (
                      <tr key={`${lineItem.name}-${index}`} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-800">{lineItem.name}</td>
                        <td className="px-3 py-1.5 text-slate-600">{lineItem.quantity ?? "—"}</td>
                        <td className="px-3 py-1.5 text-slate-600">{lineItem.value ?? "Needs review"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={3}>
                        No line items extracted.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div> : null}

        </div>

        <aside className={clsx("rounded-xl border border-rose-100 bg-white p-2 lg:block lg:sticky lg:top-32 lg:self-start", !showImage && "hidden")}>
            <p className="mb-2 text-xs font-semibold text-slate-700">Receipt image</p>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element -- Blob preview URLs cannot be optimized by next/image. */}
              <img src={item.previewUrl} alt={`Inline preview of ${item.file.name}`} className="mx-auto max-h-72 w-auto object-contain" />
            </div>
            <p className="mt-2 truncate text-xs text-slate-500" title={item.file.name}>
              {item.file.name}
            </p>
          </aside>
      </div>
    </div>
  );
}

function EditableField({
  item,
  field,
  label,
  type = "text",
  onFieldChange
}: {
  item: ReceiptQueueItem;
  field: keyof ReceiptFormValues;
  label: string;
  type?: string;
  onFieldChange: (id: string, field: keyof ReceiptFormValues, value: string) => void;
}) {
  const error = item.errors[field];

  return (
    <label className="space-y-1" htmlFor={`${item.id}-${field}`}>
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        id={`${item.id}-${field}`}
        aria-label={label}
        type={type}
        value={item.formValues[field]}
        onChange={(event) => onFieldChange(item.id, field, event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${item.id}-${field}-error` : undefined}
        className={clsx(
          "w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100",
          error ? "border-rose-300 bg-rose-50" : "border-slate-200"
        )}
      />
      {error ? <p id={`${item.id}-${field}-error`} className="text-xs font-medium text-rose-600">{error}</p> : null}
    </label>
  );
}

function ReceiptQueueItemRow({
  item,
  onToggleSelected,
  onToggleExpanded,
  onPreview,
  onDelete,
  onFieldChange,
  onSave,
  onDiscard,
  onReview,
  onSeen
}: {
  item: ReceiptQueueItem;
  onToggleSelected: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onPreview: (id: string) => void;
  onDelete: (id: string) => void;
  onFieldChange: (id: string, field: keyof ReceiptFormValues, value: string) => void;
  onSave: (id: string) => void;
  onDiscard: (id: string) => void;
  onReview: (id: string) => void;
  onSeen: (id: string) => void;
}) {
  const complete = isCompleteItem(item);
  const hasErrors = Object.values(item.errors).some(Boolean);
  const hasLeftEdge = item.status === "failed" || hasErrors;
  const canShowProcessedActions = !["ready", "extracting"].includes(item.status);
  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!canShowProcessedActions) return;

    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, label, a")) return;

    onToggleExpanded(item.id);
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canShowProcessedActions || (event.key !== "Enter" && event.key !== " ")) return;

    event.preventDefault();
    onToggleExpanded(item.id);
  };

  return (
    <article
      onMouseEnter={() => onSeen(item.id)}
      className={clsx(
        "relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors duration-300",
        !complete && !hasLeftEdge && item.status !== "extracting" && "border-slate-200",
        item.status === "extracting" && "border-blue-200",
        complete && "border-emerald-200",
        hasErrors && "border-rose-200",

        item.status === "failed" && "border-rose-200"
      )}
    >
      {hasLeftEdge ? (
        <div
          className={clsx(
            "absolute left-0 top-0 h-full w-1 rounded-none transition-all duration-300",
            ["extracted", "edited"].includes(item.status) && (item.resultSeen ? "bg-emerald-300" : "bg-emerald-500"),
            ["needs-review", "failed"].includes(item.status) && (item.resultSeen ? "bg-rose-300" : "bg-rose-500")
          )}
        />
      ) : null}

      <div
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        role={canShowProcessedActions ? "button" : undefined}
        tabIndex={canShowProcessedActions ? 0 : undefined}
        aria-expanded={canShowProcessedActions ? item.expanded : undefined}
        aria-label={canShowProcessedActions ? `${item.expanded ? "Collapse" : "Expand"} details for ${item.file.name}` : undefined}
        title={canShowProcessedActions ? (item.expanded ? "Collapse receipt details" : "Expand receipt details") : undefined}
        data-testid={`receipt-row-toggle-${item.file.name}`}
        className={clsx(
          "relative min-h-[96px] px-3 py-4 pl-14 pr-[7.75rem] sm:pr-[10.5rem]",
          canShowProcessedActions && "cursor-pointer hover:bg-slate-50/60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        )}
      >
        <button
          type="button"
          aria-label={item.selected ? `Deselect ${item.file.name}` : `Select ${item.file.name}`}
          title={item.selected ? "Deselect file" : "Select file"}
          onClick={() => onToggleSelected(item.id)}
          className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 hover:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {item.selected ? <Check className="h-4 w-4 text-blue-600" aria-hidden="true" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-400" />}
        </button>

        <div className="min-w-0">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <p className="min-w-0 truncate text-sm font-bold text-slate-950" title={item.file.name}>
              {item.file.name}
            </p>
            <span className="text-xs font-semibold text-slate-500">{item.expanded && item.status === "extracted" ? "Needs review" : statusLabel(item)}</span>
            {canShowProcessedActions && !item.expanded && item.formValues.receiptType ? (
              <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {item.formValues.receiptType}
              </span>
            ) : null}
          </div>
          <div className={clsx("mt-1.5 min-w-0", canShowProcessedActions && "pr-8")}>
            <p className="min-w-0 truncate text-sm text-slate-600" title={formatSummary(item)}>
              {formatSummary(item)}
            </p>
          </div>
        </div>

        <div className="absolute right-3 top-4 flex items-center justify-end gap-1.5">
          <IconButton label={`Preview ${item.file.name}`} onClick={(event) => { event.currentTarget.focus(); onPreview(item.id); }} tone="preview">
            <Eye className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={`Delete ${item.file.name}`} onClick={() => onDelete(item.id)} tone="delete">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>

        {canShowProcessedActions ? (
          <div className="absolute bottom-3 right-3">
            <IconButton
              label={item.expanded ? `Collapse ${item.file.name}` : `Expand ${item.file.name}`}
              onClick={() => onToggleExpanded(item.id)}
              tone="expand"
            >
              {item.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </IconButton>
          </div>
        ) : null}
      </div>

      {item.expanded ? <ExpandedReceiptDetails item={item} onFieldChange={onFieldChange} /> : null}

      {item.selected && !item.extraction && <p className="border-t border-slate-100 px-4 py-2 text-sm text-slate-600">Excluded from export — {item.status === "failed" ? "retry extraction, then review" : item.status === "extracting" ? "extraction is in progress" : "extract this receipt, then review"}.</p>}
      {item.extraction && <div className="border-t border-slate-200 px-4 py-3 space-y-2 text-sm">
        {item.selected && !complete && <p className="text-slate-600">{JSON.stringify(item.savedValues) !== JSON.stringify(item.formValues) ? "Save or discard changes before export." : hasErrors ? "Resolve the highlighted fields before export." : "Mark reviewed to include in export."}</p>}
        <div className="flex flex-wrap gap-2 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:rounded-lg [&_button]:border [&_button]:border-slate-300 [&_button]:px-3 [&_button]:py-2 [&_button]:font-semibold [&_button:disabled]:opacity-40">
          <button aria-label="Save changes" title="Save changes" onClick={() => onSave(item.id)}><Save className="h-4 w-4" aria-hidden="true" /></button>
          <button aria-label="Discard changes" title="Discard changes" onClick={() => onDiscard(item.id)}><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
          <button disabled={JSON.stringify(item.savedValues) !== JSON.stringify(item.formValues)} onClick={() => onReview(item.id)}><Check className="mr-2 inline h-4 w-4" aria-hidden="true" />Mark reviewed</button>
        </div>
      </div>}

      {item.status === "extracting" ? (
        <div className="absolute bottom-0 left-0 h-1 w-full bg-slate-100">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: item.status === "extracting" ? "100%" : "0%" }} />
        </div>
      ) : null}
    </article>
  );
}

function FloatingBatchFooter({
  fileCount,
  selectedCount,
  canAddMore,
  canExtractSelected,
  extractCount,
  canDownloadSelected,
  onSelectToggle,
  onFiles,
  onExtract,
  onDownload,
  eligibleCount,
  onJson
}: {
  fileCount: number;
  selectedCount: number;
  canAddMore: boolean;
  canExtractSelected: boolean;
  extractCount: number;
  canDownloadSelected: boolean;
  onSelectToggle: () => void;
  onFiles: (files: FileList | null) => void;
  onExtract: () => void;
  onDownload: () => void;
  eligibleCount: number;
  onJson: () => void;
}) {
  const hasMultipleFiles = fileCount > 1;

  return (
    <div className="mx-auto mt-5 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {hasMultipleFiles ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-slate-700">
              {fileCount} / {maxFiles} files · {selectedCount} selected
            </p>
            <button type="button" onClick={onSelectToggle} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 hover:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] focus:outline-none focus:ring-2 focus:ring-blue-500">
              <Check className="mr-1 inline h-4 w-4" aria-hidden="true" />{selectedCount === fileCount ? "Deselect all" : "Select all"}
            </button>
          </div>
        ) : (
          <p className="text-sm font-semibold text-slate-700">{selectedCount} selected</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <AddFileButton canAddMore={canAddMore} onFiles={onFiles} />
            <button type="button" disabled={!canDownloadSelected} onClick={onDownload} className="rounded-xl border border-slate-900 bg-slate-950 px-3 py-2 text-sm font-bold text-white transition enabled:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40" title="Only current reviewed receipts can be exported.">
              <Download className="mr-2 inline h-4 w-4" aria-hidden="true" />Export expenses CSV ({eligibleCount})
            </button>
          <button aria-label="Export JSON" title="Export provenance JSON" disabled={!canDownloadSelected} onClick={onJson} className="min-h-11 min-w-11 rounded-lg border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"><FileJson className="h-4 w-4" aria-hidden="true" /></button>
          <button
            type="button"
            disabled={!canExtractSelected}
            onClick={onExtract}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300 disabled:hover:shadow-none"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {canExtractSelected ? `Extract ${extractCount} ${extractCount === 1 ? "file" : "files"}` : "Extract"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [items, setItems] = useState<ReceiptQueueItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const closePreview = useCallback(() => setPreviewItemId(null), []);
  const [removedToast, setRemovedToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const storageReady = useRef(false);
  const stopRequested = useRef(false);
  const extracting = useRef(false);
  const uploadInProgress = useRef(false);
  const [addingFiles, setAddingFiles] = useState(false);
  const progressTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const itemsRef = useRef<ReceiptQueueItem[]>([]);

  const selectedItems = useMemo(() => items.filter((item) => item.selected), [items]);
  const selectedExtractableItems = useMemo(
    () => selectedItems.filter((item) => extractableStatuses.includes(item.status)),
    [selectedItems]
  );
  const completeSelectedItems = useMemo(() => selectedItems.filter(isCompleteItem), [selectedItems]);
  const canAddMore = !legacy && hydrated && !busy && !addingFiles && items.length < maxFiles;
  const previewItem = items.find((item) => item.id === previewItemId) ?? null;

  useEffect(() => {
    const oldHost = window.location.hostname === "tp-intern-malaysia.vercel.app";
    setLegacy(oldHost);
    readBatch().then(async (saved) => {
      if (oldHost && !saved.length) { await writeBatch([]); window.location.replace("https://receipt-to-form-syahmiharith.vercel.app/"); return; }
      storageReady.current = true;
      setItems(saved.map((item) => ({ ...item, previewUrl: URL.createObjectURL(item.file),
        status: item.status === "extracting" ? "failed" : item.status,
        errorMessage: item.status === "extracting" ? "Extraction interrupted. Retry when ready." : item.errorMessage })));
    }).catch(() => setErrorMessage("Saved data could not be opened. Could not save on this device. You can continue in this tab or clear saved data."))
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated || !storageReady.current) return;
    writeBatch(items).catch(() => setErrorMessage("Could not save on this device. Keep this tab open and export reviewed receipts before leaving."));
  }, [items, hydrated]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const timers = progressTimers.current;
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      Object.values(timers).forEach(clearInterval);
    };
  }, []);

  function updateItem(id: string, updater: (item: ReceiptQueueItem) => ReceiptQueueItem) {
    setItems((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }

  function markResultSeen(id: string) {
    updateItem(id, (item) => ({ ...item, resultSeen: true, isNewResult: false }));
  }

  async function handleFiles(files: FileList | null) {
    if (legacy || !files?.length || uploadInProgress.current || busy || !hydrated) return;
    uploadInProgress.current = true;
    setAddingFiles(true);
    const nextItems: ReceiptQueueItem[] = [];
    const selectedFiles = Array.from(files);

    try {
      const errors: string[] = [];
      const existingItems = itemsRef.current;
      const remainingSlots = Math.max(0, maxFiles - existingItems.length);
      const fingerprint = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const seen = new Set(await Promise.all(existingItems.map((item) => fingerprint(item.file))));

      for (const file of selectedFiles.slice(0, remainingSlots)) {
        if (!allowedReceiptImageTypes.includes(file.type as (typeof allowedReceiptImageTypes)[number])) {
          errors.push(`${file.name}: unsupported file type.`);
          continue;
        }
        if (file.size > maxReceiptImageSizeBytes) {
          errors.push(`${file.name}: file is larger than 5MB.`);
          continue;
        }
        const hash = await fingerprint(file);
        if (seen.has(hash)) {
          errors.push(`${file.name}: identical file skipped.`);
          continue;
        }
        seen.add(hash);
        nextItems.push({
          id: createQueueItemId(), file, previewUrl: URL.createObjectURL(file),
          selected: true, expanded: false, status: "ready", editedAt: Date.now(), progress: 0,
          extraction: null, formValues: emptyReceiptForm, errors: {}, errorMessage: null,
          isNewResult: false, resultSeen: false
        });
      }
      if (selectedFiles.length > remainingSlots) {
        errors.push(`Only ${remainingSlots} upload ${remainingSlots === 1 ? "slot is" : "slots are"} available.`);
      }
      setItems((current) => [...current, ...nextItems]);
      setErrorMessage(errors.length ? errors.join(" ") : null);
    } catch {
      nextItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setErrorMessage("The selected files could not be read. Try adding them again.");
    } finally {
      uploadInProgress.current = false;
      setAddingFiles(false);
    }
  }

  function loadSamples() {
    if (legacy || uploadInProgress.current || busy || itemsRef.current.length > maxFiles - 2) return;
    const samples = [sampleReceipt("Sample cafe", "12.50", "12.50"), sampleReceipt("Sample stationery", "28.00", "23.00")];
    setItems((current) => [...current, ...samples]);
  }

  function deleteItem(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (item) {
      URL.revokeObjectURL(item.previewUrl);
      setRemovedToast("Receipt removed.");
    }
    setItems((current) => current.filter((candidate) => candidate.id !== id));
  }

  function toggleSelected(id: string) {
    markResultSeen(id);
    updateItem(id, (item) => ({ ...item, selected: !item.selected }));
  }

  function toggleExpanded(id: string) {
    markResultSeen(id);
    updateItem(id, (item) => ({ ...item, expanded: !item.expanded }));
  }

  function openPreview(id: string) {
    markResultSeen(id);
    setPreviewItemId(id);
  }

  async function extractSingleItem(id: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item || extracting.current || !extractableStatuses.includes(item.status)) return;
    extracting.current = true;

    updateItem(id, (current) => ({
      ...current,
      status: "extracting",
      progress: 5,
      errorMessage: null,
      errors: {},
      isNewResult: false,
      resultSeen: false
    }));


    try {
      const body = new FormData();
      body.append("receipt", item.file);

      const response = await fetch("/api/extract-receipt", {
        method: "POST",
        body
      });
      const payload = (await response.json()) as ExtractApiResponse;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "Receipt extraction failed.");
      }

      const formValues = extractionToFormValues(payload.data);
      const errors = validateReceiptForm(formValues);
      const complete = isExtractionComplete(payload.data);

      updateItem(id, (current) => ({
        ...current,
        status: complete ? "extracted" : "needs-review",
        progress: 100,
        extraction: payload.data ?? null,
        savedValues: formValues,
        reviewedAt: undefined,
        extractedAt: payload.extractedAt ?? new Date().toISOString(),
        requestId: payload.requestId,
        editedAt: Date.now(),
        formValues,
        errors,
        errorMessage: null,
        isNewResult: true,
        resultSeen: false
      }));
    } catch (error) {
      updateItem(id, (current) => ({
        ...current,
        status: "failed",
        progress: 0,
        errorMessage: error instanceof TypeError
          ? "Extraction interrupted. Retry when ready."
          : error instanceof Error ? error.message : "Receipt extraction failed.",
        isNewResult: true,
        resultSeen: false
      }));
    } finally {
      extracting.current = false;
      clearInterval(progressTimers.current[id]);
      delete progressTimers.current[id];
    }
  }

  async function extractSelected() {
    if (busy) return;
    setBusy(true);
    stopRequested.current = false;
    const targets = items.filter((item) => item.selected && extractableStatuses.includes(item.status));

    for (const item of targets) {
      if (stopRequested.current) break;
      await extractSingleItem(item.id);
    }
    setBusy(false);
  }

  function updateField(id: string, field: keyof ReceiptFormValues, value: string) {
    updateItem(id, (item) => ({
      ...item,
      editedAt: Date.now(),
      formValues: { ...item.formValues, [field]: value },
      errors: { ...item.errors, [field]: undefined }
    }));
  }

  function focusFirstError(id: string, errors: FieldErrors) {
    const field = Object.keys(errors)[0];
    if (field) document.getElementById(`${id}-${field}`)?.focus();
  }

  function saveChanges(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    const errors = validateReceiptForm(item.formValues);
    const invalid = Object.keys(errors).length > 0;
    flushSync(() => updateItem(id, (current) => invalid
      ? { ...current, errors, expanded: true }
      : { ...current, savedValues: { ...current.formValues }, reviewedAt: undefined,
        editedAt: Date.now(), errors, status: "needs-review", resultSeen: true }));
    focusFirstError(id, errors);
  }

  function markReviewed(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || JSON.stringify(item.savedValues) !== JSON.stringify(item.formValues)) return;
    const errors = validateReceiptForm(item.formValues);
    const invalid = Object.keys(errors).length > 0;
    flushSync(() => updateItem(id, (current) => ({
      ...current, errors, expanded: invalid || current.expanded,
      reviewedAt: invalid ? undefined : new Date().toISOString(), editedAt: Date.now()
    })));
    focusFirstError(id, errors);
  }

  async function clearSavedData() {
    if (uploadInProgress.current || busy) return;
    if (legacy) {
      try { await writeBatch([]); }
      catch { setErrorMessage("Could not clear saved data. Your receipts remain at this address. Try again before leaving."); return; }
    }
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    storageReady.current = true;
    setErrorMessage(null);
    setRemovedToast(null);
    setPreviewItemId(null);
    setItems([]);
    if (legacy) window.location.replace("https://receipt-to-form-syahmiharith.vercel.app/");
  }

  function downloadSelected() {
    const payload = completeSelectedItems.map(buildDownloadPayload).filter(Boolean);
    if (!payload.length) return;
    const csv = expensesCsv(completeSelectedItems.map((item) => ({ id: item.id, source: item.file.name, values: item.savedValues!, reviewedAt: item.reviewedAt! })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "expenses.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <AppHeader />
      <section className="mx-auto max-w-5xl px-4 py-6 space-y-3 text-sm [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:rounded-lg [&_button]:border [&_button]:border-slate-300 [&_button]:bg-white [&_button]:px-3 [&_button]:py-2 [&_button]:font-semibold [&_button:disabled]:opacity-40 [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-blue-500">
        <h1 className="text-2xl font-bold">Turn receipts into expense records</h1>
        <p className="max-w-2xl text-slate-600">Receipt images are sent to an AI provider for extraction.</p>
        <details className="max-w-2xl text-xs text-slate-500">
          <summary className="w-fit cursor-pointer rounded py-1 underline-offset-4 hover:text-slate-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Privacy &amp; storage</summary>
          <p className="pt-2 leading-relaxed">Live extraction uses Google Gemini. Samples stay in your browser without a provider request. Receipts and edits are saved in this browser for seven days after your last edit. Browser storage may be cleared; export anything you need to keep.</p>
        </details>
        <div className="flex flex-wrap items-center gap-2">
        <button aria-label="Try two sample receipts" title="Try two sample receipts" disabled={legacy || !hydrated || busy || addingFiles || items.length > 3} onClick={loadSamples}><FlaskConical className="mr-2 inline h-4 w-4" aria-hidden="true" />Samples</button>
        {(items.length > 0 || errorMessage) && <button aria-label="Clear saved receipts" title="Clear saved receipts" disabled={!hydrated || busy || addingFiles} onClick={clearSavedData}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
        {addingFiles && <p role="status">Checking selected receipts…</p>}
        {busy && <button onClick={() => { stopRequested.current = true; }}><Square className="mr-2 inline h-4 w-4" aria-hidden="true" />Stop remaining work</button>}
        </div>
        {legacy && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3">You are recovering receipts saved at the old address. Finish reviewing and export them here. Saved work stays here until cleared or expired. <a className="underline font-semibold" href="https://receipt-to-form-syahmiharith.vercel.app/">Open the main app</a></div>}
      </section>
      <main className="min-h-[calc(100vh-151px)] px-4 pb-28 pt-5 sm:px-6 lg:px-8">
        {items.length === 0 ? (
          <div className="flex min-h-[calc(100vh-18rem)] flex-col items-center justify-center gap-4">
            {errorMessage ? (
              <div className="w-full max-w-3xl rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
                {errorMessage}
              </div>
            ) : null}
            <UploadDropzone canAddMore={canAddMore && hydrated && !busy} onFiles={handleFiles} />
          </div>
        ) : (
          <section className="mx-auto max-w-5xl">
            {errorMessage ? (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                <p>{errorMessage}</p>
              </div>
            ) : null}

            <div className="space-y-3">
              {items.map((item) => (
                <ReceiptQueueItemRow
                  key={item.id}
                  item={item}
                  onToggleSelected={toggleSelected}
                  onToggleExpanded={toggleExpanded}
                  onPreview={openPreview}
                  onDelete={deleteItem}
                  onFieldChange={updateField}
                  onSave={saveChanges}
                  onReview={markReviewed}
                  onDiscard={(id) => updateItem(id, (current) => ({ ...current, formValues: { ...(current.savedValues ?? current.formValues) }, errors: {} }))}
                  onSeen={markResultSeen}
                />
              ))}
            </div>
          </section>
        )}

        {items.length > 0 ? (
          <FloatingBatchFooter
            fileCount={items.length}
            selectedCount={selectedItems.length}
            canAddMore={canAddMore && hydrated && !busy}
            canExtractSelected={!busy && !addingFiles && selectedExtractableItems.length > 0}
            extractCount={selectedExtractableItems.length}
            canDownloadSelected={completeSelectedItems.length > 0}
            onSelectToggle={() => {
              const shouldSelect = selectedItems.length !== items.length;
              setItems((current) => current.map((item) => ({ ...item, selected: shouldSelect, resultSeen: true })));
            }}
            onFiles={handleFiles}
            onExtract={extractSelected}
            eligibleCount={completeSelectedItems.length}
            onJson={() => downloadJson("expenses.json", completeSelectedItems.map(buildDownloadPayload))}
            onDownload={downloadSelected}
          />
        ) : null}

        {previewItem ? <ReceiptPreviewModal item={previewItem} onClose={closePreview} /> : null}

        {removedToast ? (
          <div className="fixed right-4 top-16 z-50 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl">
            {removedToast}
          </div>
        ) : null}
      </main>
    </>
  );
}
