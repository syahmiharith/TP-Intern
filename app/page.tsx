"use client";
import { readBatch, writeBatch, expensesCsv, sampleReceipt } from "@/lib/expense-workflow";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { MouseEvent, ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Code2,
  MessageSquare,
  Save,
  FileText,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Download,
  Square,
  Sparkles,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Upload,
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
  if (item.status === "ready" || item.status === "extracting") return formatFileSize(item.file.size);
  if (item.status === "failed") return item.errorMessage ?? "Extraction failed. Try again.";

  const merchant = item.formValues.merchantName.trim() || "Unknown merchant";
  const currency = item.formValues.currency.trim().toUpperCase() || "—";
  const total = item.formValues.totalAmount.trim() || "—";
  const date = item.formValues.date.trim() || "—";

  return `${merchant} · ${currency} ${total} · ${date}`;
}

function statusLabel(item: ReceiptQueueItem) {
  if (item.status === "failed") return "Failed";
  if (isCompleteItem(item)) return "Reviewed";
  if (item.extraction && JSON.stringify(item.savedValues) !== JSON.stringify(item.formValues)) return "Unsaved changes";
  if (item.extraction) return "Needs review";
  if (item.status === "ready") return "Queued";
  if (item.status === "extracting") return "Reading";
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
        "inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35",
        tone === "neutral" && "hover:bg-slate-100 hover:text-slate-950 focus:ring-blue-500",
        tone === "preview" && "hover:bg-blue-50 hover:text-blue-700 focus:ring-blue-500",
        tone === "download" && "hover:bg-emerald-50 hover:text-emerald-700 focus:ring-emerald-500",
        tone === "delete" && "hover:bg-rose-50 hover:text-rose-700 focus:ring-rose-500",
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
        className="peer sr-only"
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
          "cursor-pointer border-slate-200 bg-white text-center transition hover:border-blue-400 hover:bg-blue-50 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500",
          compact
            ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold text-slate-700 hover:text-blue-700"
            : "flex min-h-56 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-10 shadow-soft",
          !canAddMore && "pointer-events-none opacity-50"
        )}
      >
        {compact ? (
          <Plus className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Upload className="mb-5 h-10 w-10 text-blue-600" aria-hidden="true" />
        )}
        <span className={clsx("font-bold", compact ? "text-sm" : "text-xl text-slate-950")}>
          {compact ? "Add files" : "Upload receipts"}
        </span>
        {!compact ? (
          <>
            <span className="mt-3 text-sm text-slate-500">JPG, PNG or WEBP · Up to 5 receipts</span>
            <span className="mt-1 text-sm text-slate-500">5 MB each</span>
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
  const [imageState, setImageState] = useState<"loading" | "ready" | "failed">("loading");
  const dialogRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const sideways = rotation % 180 !== 0;
  const orientedWidth = sideways ? imageSize.height : imageSize.width;
  const orientedHeight = sideways ? imageSize.width : imageSize.height;
  const fit = Math.min(viewportSize.width / orientedWidth, viewportSize.height / orientedHeight);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight }));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

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
        const buttons = dialog?.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex=\"0\"], summary");
        if (!buttons?.length) return;
        event.preventDefault();
        const current = Array.from(buttons).indexOf(document.activeElement as HTMLElement);
        const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus();
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
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 id="receipt-preview-title" className="text-lg font-bold text-slate-950">Receipt Preview</h2>
          <div className="ml-auto flex items-center gap-1">
          {imageState !== "failed" && <>
          <IconButton label="Rotate clockwise" onClick={() => setRotation((value) => value + 90)}><RotateCw className="h-4 w-4" aria-hidden="true" /></IconButton>
          <IconButton label={zoom === 1 ? "Zoom in" : "Zoom out"} onClick={() => { setZoom((value) => value === 1 ? 2 : 1); viewportRef.current?.scrollTo(0, 0); }}>{zoom === 1 ? <ZoomIn className="h-4 w-4" aria-hidden="true" /> : <ZoomOut className="h-4 w-4" aria-hidden="true" />}</IconButton>
          </>}
          <IconButton label="Close preview" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          </div>
        </div>
        <div className="overflow-auto p-4">
          <div ref={viewportRef} role="region" aria-label="Receipt image viewer" tabIndex={0} className="h-[50vh] max-h-[32rem] overflow-auto rounded-lg bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
            <div className="relative" style={{ width: Math.max(viewportSize.width, orientedWidth * fit * zoom), height: Math.max(viewportSize.height, orientedHeight * fit * zoom) }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Blob preview URLs cannot be optimized by next/image. */}
              <img src={item.previewUrl} onLoad={(event) => { setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setImageState("ready"); }} onError={() => { setImageState("failed"); dialogRef.current?.querySelector<HTMLButtonElement>('[aria-label="Close preview"]')?.focus(); }} style={{ width: imageSize.width * fit * zoom, height: imageSize.height * fit * zoom, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }} alt={`Preview of ${item.file.name}`} className={clsx("absolute left-1/2 top-1/2 max-w-none rounded object-contain", imageState !== "ready" && "invisible")} />
              {imageState !== "ready" && <p role={imageState === "failed" ? "alert" : "status"} className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-slate-600">{imageState === "failed" ? "This image could not be displayed. Close the preview and try another file." : "Loading image…"}</p>}
            </div>
          </div>
          <details className="mt-3 text-sm">
            <summary className="min-h-11 cursor-pointer py-3 text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">File details</summary>
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
          </details>
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
      <button className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 lg:hidden" aria-pressed={showImage} onClick={() => setShowImage((value) => !value)}>{showImage ? <FileText className="mr-1 inline h-4 w-4" aria-hidden="true" /> : <Eye className="mr-1 inline h-4 w-4" aria-hidden="true" />}{showImage ? "Show form" : "Show receipt image"}</button>



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
                  "min-h-11 w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100",
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
              <p className="text-sm text-slate-600">Model confidence: <span className="font-medium">{item.extraction?.confidence ?? "unknown"}</span></p>
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

          {item.extraction?.items.length ? <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Extracted items ({item.extraction.items.length})</summary>
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
          </details> : null}

        </div>

        <aside className={clsx("rounded-xl border border-slate-200 bg-white p-2 lg:block lg:sticky lg:top-32 lg:self-start", !showImage && "hidden")}>
            <p className="mb-2 text-xs font-semibold text-slate-700">Receipt image</p>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element -- Blob preview URLs cannot be optimized by next/image. */}
              <img src={item.previewUrl} alt={`Inline preview of ${item.file.name}`} className="mx-auto max-h-72 w-auto object-contain" />
            </div>

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
          "min-h-11 w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100",
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
  onRetry,
  busy
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
  onRetry: (id: string) => void;
  busy: boolean;
}) {
  const complete = isCompleteItem(item);
  const dirty = Boolean(item.extraction && JSON.stringify(item.savedValues) !== JSON.stringify(item.formValues));
  const hasErrors = Object.values(item.errors).some(Boolean);
  const hasLeftEdge = item.status === "failed" || hasErrors;
  const canShowProcessedActions = Boolean(item.extraction);
  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!canShowProcessedActions) return;

    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, label, a")) return;

    onToggleExpanded(item.id);
  };


  return (
    <article
      className={clsx(
        "relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors duration-300",
        !complete && !hasLeftEdge && item.status !== "extracting" && "border-slate-200",
        item.status === "extracting" && "border-blue-200",
        complete && "border-emerald-200",
        hasErrors && "border-rose-200",

        item.status === "failed" && "border-rose-200"
      )}
    >
      {hasLeftEdge ? <div className="absolute left-0 top-0 h-full w-1 bg-rose-400" /> : null}

      <div
        onClick={handleCardClick}
        title={canShowProcessedActions ? (item.expanded ? "Collapse receipt details" : "Expand receipt details") : undefined}
        data-testid={`receipt-row-toggle-${item.file.name}`}
        className={clsx(
          "relative min-h-[96px] px-3 py-4 pl-16",
          canShowProcessedActions && "cursor-pointer hover:bg-slate-50/60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        )}
      >
        <button
          type="button"
          aria-label={item.selected ? `Deselect ${item.file.name}` : `Select ${item.file.name}`}
          title={item.selected ? "Deselect file" : "Select file"}
          aria-pressed={item.selected}
          disabled={busy}
          onClick={() => onToggleSelected(item.id)}
          className="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {item.selected ? <Check className="h-4 w-4 text-blue-600" aria-hidden="true" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-400" />}
        </button>

        <div className="min-w-0">
          <div className="flex min-w-0 flex-col gap-2 pr-28 sm:flex-row sm:items-center">
            {canShowProcessedActions ? <button
              aria-label={`${item.expanded ? "Collapse" : "Expand"} ${item.file.name}`}
              aria-expanded={item.expanded}
              title={item.expanded ? "Collapse details" : "Expand details"}
              onClick={() => onToggleExpanded(item.id)}
              className="inline-flex min-h-11 min-w-0 items-center gap-1 rounded text-left text-sm font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            ><span className="truncate">{item.file.name}</span>{item.expanded ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}</button> : <p className="min-w-0 truncate text-sm font-bold text-slate-950" title={item.file.name}>{item.file.name}</p>}
            <span className="text-xs font-semibold text-slate-500">{statusLabel(item)}</span>
            {canShowProcessedActions && !item.expanded && item.formValues.receiptType ? (
              <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {item.formValues.receiptType}
              </span>
            ) : null}
          </div>
          {(!item.expanded || item.status === "failed") && <div className="mt-1.5 min-w-0">
            <p className={clsx("min-w-0 text-sm text-slate-600", item.status === "failed" ? "break-words" : "truncate")} title={formatSummary(item)}>
              {formatSummary(item)}
            </p>
          </div>}
        </div>

        <div className="absolute right-3 top-4 flex items-center justify-end gap-1.5">
          <IconButton label={`Preview ${item.file.name}`} onClick={(event) => { event.currentTarget.focus(); onPreview(item.id); }} tone="preview">
            <Eye className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={`Delete ${item.file.name}`} disabled={busy} onClick={() => onDelete(item.id)} tone="delete">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>


      </div>

      {item.expanded && item.extraction ? <ExpandedReceiptDetails item={item} onFieldChange={onFieldChange} /> : null}

      {(item.status === "failed" || (!item.extraction && item.selected)) && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm">
        {item.selected && <p className="text-slate-600">{item.status === "failed" ? "Not exported. Retry extraction to continue." : item.status === "extracting" ? "Not exported while reading." : "Not exported until extracted and reviewed."}</p>}
        {item.status === "failed" && <button disabled={busy} onClick={() => onRetry(item.id)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40"><RotateCcw className="h-4 w-4" aria-hidden="true" />Retry</button>}
      </div>}
      {item.extraction && !complete && <div className="space-y-2 border-t border-slate-200 px-4 py-3 text-sm">
        {item.selected && <p className="text-slate-600">{hasErrors ? "Not exported. Correct the highlighted fields." : dirty ? "Not exported. Save changes, then mark reviewed." : "Not exported until reviewed."}</p>}
        <div className="flex flex-wrap gap-2 [&_button]:min-h-11 [&_button]:rounded-lg [&_button]:px-3 [&_button]:py-2 [&_button]:font-semibold [&_button:focus-visible]:outline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-blue-500 [&_button:disabled]:opacity-40">
          {dirty && <>
            <button aria-label="Save changes" title="Save changes" className="inline-flex items-center gap-2 border border-slate-300 bg-white" onClick={() => onSave(item.id)}><Save className="h-4 w-4" aria-hidden="true" />Save changes</button>
            <button aria-label="Discard changes" title="Restore the last saved values" className="text-slate-600 hover:bg-slate-100" onClick={() => onDiscard(item.id)}>Discard changes</button>
          </>}
          <button disabled={dirty} className="inline-flex items-center gap-2 border border-slate-300 bg-white" onClick={() => onReview(item.id)}><Check className="h-4 w-4" aria-hidden="true" />Mark reviewed</button>
        </div>
      </div>}

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
  onJson,
  busy,
  hasExtractable
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
  busy: boolean;
  hasExtractable: boolean;
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
            <button type="button" disabled={busy} onClick={onSelectToggle} className="min-h-11 disabled:opacity-40 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {selectedCount === fileCount ? "Deselect all" : "Select all"}
            </button>
          </div>
        ) : (
          <p className="text-sm font-semibold text-slate-700">{selectedCount} selected</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <AddFileButton canAddMore={canAddMore} onFiles={onFiles} />
            <button type="button" disabled={!canDownloadSelected} onClick={onDownload} className="min-h-11 rounded-xl border border-slate-900 bg-slate-950 px-3 py-2 text-sm font-bold text-white transition enabled:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40" title="Only current reviewed receipts can be exported.">
              <Download className="mr-2 inline h-4 w-4" aria-hidden="true" />Export expenses CSV ({eligibleCount})
            </button>
          {canDownloadSelected && <button aria-label="Export JSON" title="Export provenance JSON" onClick={onJson} className="min-h-11 min-w-11 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">JSON</button>}
          {hasExtractable && <button
            type="button"
            disabled={!canExtractSelected}
            onClick={onExtract}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300 disabled:opacity-40 disabled:hover:shadow-none"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {canExtractSelected ? `Extract ${extractCount} ${extractCount === 1 ? "file" : "files"}` : "Extract"}
          </button>}
        </div>
      </div>
    </div>
  );
}

const feedbackUrl = "https://github.com/syahmiharith/receipt-to-form/issues/new?" + new URLSearchParams({
  title: "Receipt-to-Form feedback",
  body: "Please use synthetic examples. Do not attach real receipts or personal information.\n\nWhat were you trying to do?\n\nWhat happened?\n\nWhat did you expect?\n\nDevice and browser (optional):\n"
}).toString();

function ProductFooter() {
  const linkStyle = "inline-flex min-h-11 items-center gap-2 rounded text-sm text-slate-600 transition hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500";
  return (
    <footer className="border-t border-slate-200 bg-white/60 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">Built by <span className="font-medium text-slate-800">Zulsyahmi Zulkefli</span></p>
          <nav aria-label="Project links" className="flex flex-wrap gap-x-6 gap-y-1">
            <a className={linkStyle} href="https://portfolio-syahmiharith.vercel.app/" target="_blank" rel="noopener noreferrer" title="Open portfolio in a new tab"><ArrowUpRight className="h-4 w-4" aria-hidden="true" />More work<span className="sr-only"> (opens in a new tab)</span></a>
            <a className={linkStyle} href="https://github.com/syahmiharith/receipt-to-form" target="_blank" rel="noopener noreferrer" title="View source on GitHub in a new tab"><Code2 className="h-4 w-4" aria-hidden="true" />Source code<span className="sr-only"> (opens in a new tab)</span></a>
            <a className={linkStyle} href={feedbackUrl} target="_blank" rel="noopener noreferrer" title="Open a public GitHub issue form in a new tab"><MessageSquare className="h-4 w-4" aria-hidden="true" />Report a problem<span className="sr-only"> on GitHub (opens in a new tab)</span></a>
          </nav>
        </div>
        <details className="max-w-2xl text-xs text-slate-600">
          <summary className="min-h-11 w-fit cursor-pointer rounded py-3 underline-offset-4 hover:text-slate-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Privacy &amp; storage</summary>
          <p className="pt-2 leading-relaxed">Live extraction uses Google Gemini. Samples stay in your browser without a provider request. Receipts and edits are saved in this browser for seven days after your last edit. Browser storage may be cleared; export anything you need to keep.</p>
        </details>
      </div>
    </footer>
  );
}

export default function Home() {
  const [items, setItems] = useState<ReceiptQueueItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const closePreview = useCallback(() => setPreviewItemId(null), []);
  const [removedToast, setRemovedToast] = useState<string | null>(null);

  useEffect(() => {
    if (!removedToast) return;
    const timeout = setTimeout(() => setRemovedToast(null), 5000);
    return () => clearTimeout(timeout);
  }, [removedToast]);
  const [hydrated, setHydrated] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const storageReady = useRef(false);
  const stopRequested = useRef(false);
  const extracting = useRef(false);
  const uploadInProgress = useRef(false);
  const [addingFiles, setAddingFiles] = useState(false);
  const [queueRun, setQueueRun] = useState<{ completed: number; total: number; stopping: boolean; stopped: boolean } | null>(null);
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
    }).catch(() => setErrorMessage("Saved data could not be opened. Keep this tab open and export reviewed receipts before leaving."))
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
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
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
    setQueueRun(null);
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
    setQueueRun(null);
    const samples = [sampleReceipt("Sample cafe", "12.50", "12.50"), sampleReceipt("Sample stationery", "28.00", "23.00")];
    setItems((current) => [...current, ...samples]);
  }

  function deleteItem(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (item) {
      URL.revokeObjectURL(item.previewUrl);
      setRemovedToast("Receipt removed.");
      setQueueRun(null);
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
    }
  }

  async function extractSelected(ids?: string[]) {
    if (busy) return;
    setBusy(true);
    stopRequested.current = false;
    const targets = items.filter((item) => (ids ? ids.includes(item.id) : item.selected) && extractableStatuses.includes(item.status));
    setQueueRun({ completed: 0, total: targets.length, stopping: false, stopped: false });
    let completed = 0;

    for (const item of targets) {
      if (stopRequested.current) break;
      await extractSingleItem(item.id);
      completed += 1;
      setQueueRun((run) => run && ({ ...run, completed }));
    }
    setQueueRun((run) => run && ({ ...run, stopped: completed < targets.length, stopping: false }));
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
    if (!item || JSON.stringify(item.savedValues) === JSON.stringify(item.formValues)) return;
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
    setQueueRun(null);
    if (legacy) window.location.replace("https://receipt-to-form-syahmiharith.vercel.app/");
  }

  function downloadSelected() {
    const payload = completeSelectedItems.map(buildDownloadPayload).filter(Boolean);
    if (!payload.length) return;
    const csv = expensesCsv(completeSelectedItems.map((item) => ({ id: item.id, source: item.file.name, values: item.savedValues!, reviewedAt: item.reviewedAt! })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "expenses.csv"; link.click(); URL.revokeObjectURL(url);
    setRemovedToast("CSV export started.");
  }

  return (
    <>
      <AppHeader />
      <section className="mx-auto max-w-5xl px-4 py-6 space-y-3 text-sm [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:rounded-lg [&_button]:border [&_button]:border-slate-300 [&_button]:bg-white [&_button]:px-3 [&_button]:py-2 [&_button]:font-semibold [&_button:disabled]:opacity-40 [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-blue-500">
        <h1 className="text-2xl font-bold">Turn receipts into expense records</h1>
        <p className="max-w-2xl text-slate-600">We use an external AI service to read your receipts.</p>

        <div className="flex flex-wrap items-center gap-2">
        {items.length > 0 && <button title="Add two synthetic receipts" disabled={legacy || !hydrated || busy || addingFiles || items.length > 3} onClick={loadSamples}>Try samples</button>}
        {(items.length > 0 || errorMessage) && <button aria-label="Clear all saved receipts" title="Clear all receipts saved in this browser" disabled={!hydrated || busy || addingFiles} onClick={clearSavedData}>Clear all</button>}
        {addingFiles && <p role="status">Checking selected receipts…</p>}
        {busy && queueRun && queueRun.completed < queueRun.total - 1 && <button aria-label={queueRun?.stopping ? "Stopping after current receipt" : "Stop queue after current receipt"} disabled={queueRun?.stopping} onClick={() => { stopRequested.current = true; setQueueRun((run) => run && ({ ...run, stopping: true })); }}><Square className="mr-2 inline h-4 w-4" aria-hidden="true" />{queueRun?.stopping ? "Stopping…" : "Stop queue"}</button>}
        </div>
        {queueRun && <p role="status" className="text-slate-600">{queueRun.completed} of {queueRun.total} processed{queueRun.stopped ? " · Stopped" : ""}</p>}
        {!hydrated && <p role="status" className="text-slate-600">Loading saved receipts…</p>}
        {removedToast && <p role="status" className="text-slate-600">{removedToast}</p>}
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
            <button title="Add two synthetic receipts" disabled={legacy || !hydrated || busy || addingFiles} onClick={loadSamples} className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40">Try samples</button>
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
                  onRetry={(id) => { void extractSelected([id]); }}
                  busy={busy}
                  onDiscard={(id) => updateItem(id, (current) => ({ ...current, formValues: { ...(current.savedValues ?? current.formValues) }, errors: {} }))}
                />
              ))}
            </div>
          </section>
        )}

        {items.length > 0 ? (
          <FloatingBatchFooter
            fileCount={items.length}
            busy={busy}
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
            onExtract={() => { void extractSelected(); }}
            hasExtractable={items.some((item) => extractableStatuses.includes(item.status))}
            eligibleCount={completeSelectedItems.length}
            onJson={() => downloadJson("expenses.json", completeSelectedItems.map(buildDownloadPayload))}
            onDownload={downloadSelected}
          />
        ) : null}

        {previewItem ? <ReceiptPreviewModal item={previewItem} onClose={closePreview} /> : null}


      </main>
      <ProductFooter />
    </>
  );
}
