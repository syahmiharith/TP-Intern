"use client";
import { ArchivePicker } from "./components/archive-picker";
import { isZip, maxArchiveBytes, type ArchiveSource } from "@/lib/receipt-archive";
import { AutoGrowTextarea } from "./components/auto-grow-textarea";
import { receiptDisplayNotes } from "@/lib/receipt-notes";
import { InlineImage } from "./components/inline-image";
import { SearchField } from "./components/search-field";
import { extractionItems, lineItemErrors, type EditableLineItem } from "@/lib/line-items";
import { CurrencyField } from "./components/currency-field";
import { readBatch, writeBatch, expensesCsv, sampleReceipt } from "@/lib/expense-workflow";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Code2,
  MessageSquare,
  Files,
  Loader2,
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

  maxReceiptImageSizeBytes,
  receiptTypes,
  validateReceiptForm
} from "@/lib/receipt";

type QueueStatus = "ready" | "extracting" | "extracted" | "needs-review" | "failed" | "edited";
type FieldErrors = Partial<Record<keyof ReceiptFormValues, string>>;

export type ReceiptQueueItem = {
  id: string;
  savedValues?: ReceiptFormValues;
  lineItems?: EditableLineItem[];
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

function receiptErrors(item: ReceiptQueueItem) {
  return validateReceiptForm(item.formValues);
}
function itemLines(item: ReceiptQueueItem) { return item.lineItems ?? extractionItems(item.extraction); }
function isExportable(item: ReceiptQueueItem) {
  return Boolean(item.extraction && !["ready", "extracting", "failed"].includes(item.status) && Object.keys(receiptErrors(item)).length === 0 && itemLines(item).every(line => Object.keys(lineItemErrors(line,item.formValues.currency)).length === 0));
}
function statusLabel(item: ReceiptQueueItem) {
  if (item.status === "failed") return "Failed";
  if (item.status === "extracting") return "Extracting";
  if (item.extraction) return isExportable(item) ? "Ready" : "Needs attention";
  return "Queued";
}
function previousReviewTimestamp(item:ReceiptQueueItem) {
  return !item.lineItems && JSON.stringify(item.savedValues) === JSON.stringify(item.formValues) ? item.reviewedAt : undefined;
}
function buildDownloadPayload(item: ReceiptQueueItem) {
  if (!item.extraction) return null;
  return {schemaVersion:2, receiptId:item.id, fileName:item.file.name, extractedAt:item.extractedAt, requestId:item.requestId,
    originalExtraction:item.extraction, values:item.formValues, items:itemLines(item), updatedAt:new Date(item.editedAt ?? Date.now()).toISOString(),
    previousReview:item.reviewedAt ? {values:item.savedValues,reviewedAt:item.reviewedAt} : undefined, confidence:item.extraction.confidence};
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
        accept="image/jpeg,image/png,image/webp,.zip,application/zip,application/x-zip-compressed"
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
            <span className="mt-3 text-sm text-slate-500">JPG, PNG, WEBP or ZIP · Up to 5 receipts</span>
            <span className="mt-1 text-sm text-slate-500">Images: 5 MB each · ZIP: 25 MB</span>
          </>
        ) : null}
      </label>
      {!compact && <p className="mt-3 text-center text-xs text-slate-500">Images are sent to an external AI service when you extract.</p>}
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
          <div ref={viewportRef} role="region" aria-label="Receipt image viewer" tabIndex={0} onKeyDown={(event) => {
            const steps: Record<string, ScrollToOptions> = { ArrowLeft: { left: -40 }, ArrowRight: { left: 40 }, ArrowUp: { top: -40 }, ArrowDown: { top: 40 } };
            const step = steps[event.key];
            if (step) { event.preventDefault(); event.currentTarget.scrollBy(step); }
          }} className="h-[50vh] max-h-[32rem] overflow-auto rounded-lg bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
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

const typeOptions = receiptTypes.map(value => ({value,label:value}));
function ExpandedReceiptDetails({item,onFieldChange,onLineChange,onAddLine,onRemoveLine}: {
  item:ReceiptQueueItem;
  onFieldChange:(id:string,field:keyof ReceiptFormValues,value:string)=>void;
  onLineChange:(id:string,index:number,field:keyof EditableLineItem,value:string)=>void;
  onAddLine:(id:string)=>void; onRemoveLine:(id:string,index:number)=>void;
}) {
  return <div className="grid min-w-0 grid-cols-1 gap-4 border-t border-slate-100 bg-slate-50/70 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div className="min-w-0 space-y-4">
      {item.errorMessage && <p role="alert" className="text-sm text-rose-700">{item.errorMessage}</p>}
      {item.extraction ? <>
        <EditableField item={item} field="merchantName" label="Merchant Name" onFieldChange={onFieldChange}/>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] gap-3 md:grid-cols-[12rem_5.5rem_minmax(0,1fr)_10rem]">
          <SearchField id={`${item.id}-receiptType`} label="Receipt Type" value={item.formValues.receiptType} options={typeOptions} onChange={value=>onFieldChange(item.id,"receiptType",value)}/>
          <CurrencyField id={`${item.id}-currency`} value={item.formValues.currency} error={receiptErrors(item).currency} onChange={value=>onFieldChange(item.id,"currency",value)}/>
          <div className="col-span-2 grid min-w-0 grid-cols-2 gap-3 md:contents">
            <EditableField item={item} field="totalAmount" label="Total Amount" inputMode="decimal" onFieldChange={onFieldChange}/>
            <EditableField item={item} field="date" label="Date" type="date" onFieldChange={onFieldChange}/>
          </div>
        </div>
        <ReceiptInsights item={item} onLineChange={onLineChange} onAddLine={onAddLine} onRemoveLine={onRemoveLine}/>
      </> : <div className="space-y-3 text-sm text-slate-600">
        <p>{item.file.name} · {formatFileSize(item.file.size)}</p>
      </div>}
    </div>
    <InlineImage source={item.previewUrl} filename={item.file.name}/>
  </div>;
}

function ReceiptInsights({item,onLineChange,onAddLine,onRemoveLine}: {
  item:ReceiptQueueItem;
  onLineChange:(id:string,index:number,field:keyof EditableLineItem,value:string)=>void;
  onAddLine:(id:string)=>void; onRemoveLine:(id:string,index:number)=>void;
}) {
  if(!item.extraction)return null;
  const {notes,originalNotes}=receiptDisplayNotes(item.formValues.notes,item.extraction.notes);
  const lines=itemLines(item);
  return <div className="space-y-4">
    <section aria-label="Receipt notes" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">{(notes.length>0||originalNotes.length>0)&&<h3 className="text-xs font-semibold text-slate-700">Notes</h3>}
        <p className="text-xs text-slate-500" title="Confidence in the original extraction; unchanged by edits.">Extraction confidence <span className="font-semibold capitalize text-slate-700">{item.extraction.confidence}</span></p>
      </div>
      {notes.length>0&&<ul aria-label="Notes" className="list-disc space-y-1 pl-4 text-sm text-slate-600 [overflow-wrap:anywhere]">{notes.map((note,index)=><li key={index}>{note}</li>)}</ul>}
      {originalNotes.length>0&&<><h3 className="text-xs font-semibold text-slate-700">Extraction notes</h3><ul aria-label="Extraction notes" className="list-disc space-y-1 pl-4 text-sm text-slate-600 [overflow-wrap:anywhere]">{originalNotes.map((note,index)=><li key={index}>{note}</li>)}</ul></>}
    </section>
    <section aria-label="Extracted items" className="space-y-2">
      <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-slate-700">Extracted items ({lines.length})</h3>
        <button id={`${item.id}-add-item`} type="button" onClick={()=>onAddLine(item.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"><Plus className="h-3.5 w-3.5" aria-hidden="true"/>Add item</button>
      </div>
      {lines.length>0&&<div role="table" aria-label="Extracted items" className="min-w-0 rounded-lg border border-slate-200 bg-white">
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_3.5rem_5rem_2.5rem] gap-1 border-b border-slate-100 px-2 py-2 text-xs font-medium text-slate-500">
          <span role="columnheader">Name</span><span role="columnheader" className="text-right">Qty</span><span role="columnheader" className="text-right">Price{item.formValues.currency?` (${item.formValues.currency.trim().toUpperCase()})`:""}</span><span role="columnheader" className="sr-only">Actions</span>
        </div>
        {lines.map((line,index)=>{const errors=lineItemErrors(line,item.formValues.currency);return <div role="row" key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_3.5rem_5rem_2.5rem] items-start gap-1 border-b border-slate-100 px-2 py-1 last:border-0">
          {(["name","quantity","price"] as const).map(field=>{
            const control={
              id:`${item.id}-item-${index}-${field}`, "aria-label":`Item ${index+1} ${field}`,
              value:line[field],autoComplete:"off", "aria-invalid":Boolean(errors[field]),
              "aria-describedby":errors[field]?`${item.id}-item-${index}-${field}-error`:undefined,
              className:clsx("min-h-11 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100",field!=="name"&&"text-right tabular-nums",errors[field]&&"!border-rose-300 bg-rose-50")
            };
            return <div role="cell" key={field} className="min-w-0">
              {field==="name"?<AutoGrowTextarea {...control} className={clsx(control.className,"block resize-none overflow-hidden py-2.5 [overflow-wrap:anywhere]")} onChange={event=>onLineChange(item.id,index,field,event.target.value)}/>:
                <input {...control} type="text" inputMode="decimal" onChange={event=>onLineChange(item.id,index,field,event.target.value)}/>}
              {errors[field]&&<p id={`${item.id}-item-${index}-${field}-error`} className="px-1 text-xs text-rose-600">{errors[field]}</p>}
            </div>;
          })}
          <div role="cell"><IconButton label={`Remove item ${index+1}`} onClick={()=>onRemoveLine(item.id,index)} tone="delete"><Trash2 className="h-3.5 w-3.5" aria-hidden="true"/></IconButton></div>
        </div>;})}
      </div>}
    </section>
  </div>;
}

function EditableField({
  item,
  field,
  label,
  type = "text",
  inputMode = "text",
  onFieldChange
}: {
  item: ReceiptQueueItem;
  field: keyof ReceiptFormValues;
  label: string;
  type?: string;
  inputMode?: "text" | "decimal";
  onFieldChange: (id: string, field: keyof ReceiptFormValues, value: string) => void;
}) {
  const error = receiptErrors(item)[field];
  const control = {
    id: `${item.id}-${field}`,
    "aria-label": label,
    autoComplete: "off",
    value: item.formValues[field],
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${item.id}-${field}-error` : undefined,
    className: clsx(
      "min-h-11 w-full min-w-0 rounded-lg border bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100",
      error ? "border-rose-300 bg-rose-50" : "border-slate-200"
    )
  };
  return (
    <label className="block min-w-0 space-y-1" htmlFor={control.id}>
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      {field === "merchantName" ? <AutoGrowTextarea {...control}
        className={clsx(control.className,"block resize-none overflow-hidden py-2.5 [overflow-wrap:anywhere]")}
        onChange={event=>onFieldChange(item.id,field,event.target.value)} /> :
        <input {...control} type={type} inputMode={inputMode} onChange={event=>onFieldChange(item.id,field,event.target.value)} />}
      {error ? <p id={`${item.id}-${field}-error`} className="text-xs font-medium text-rose-600">{error}</p> : null}
    </label>
  );
}

function ReceiptQueueItemRow({item,onToggleSelected,onToggleExpanded,onPreview,onDelete,onFieldChange,onLineChange,onAddLine,onRemoveLine,onRetry,busy}: {
  item:ReceiptQueueItem; onToggleSelected:(id:string)=>void; onToggleExpanded:(id:string)=>void; onPreview:(id:string)=>void; onDelete:(id:string)=>void;
  onFieldChange:(id:string,field:keyof ReceiptFormValues,value:string)=>void;
  onLineChange:(id:string,index:number,field:keyof EditableLineItem,value:string)=>void;
  onAddLine:(id:string)=>void; onRemoveLine:(id:string,index:number)=>void; onRetry:(id:string)=>void; busy:boolean;
}) {
  const ready=isExportable(item);
  const failed=item.status==="failed";
  return <article aria-busy={item.status==="extracting"} className={clsx("relative min-w-0 rounded-2xl border bg-white shadow-sm",failed?"border-rose-200":"border-slate-200")}>
    <div data-testid={`receipt-row-toggle-${item.file.name}`} onClick={event=>{if(!(event.target as HTMLElement).closest("button,a,input"))onToggleExpanded(item.id);}} className="relative flex min-h-20 min-w-0 items-center gap-2 rounded-t-2xl px-3 py-2 hover:bg-slate-50/60">
      <button type="button" aria-label={`${item.selected?"Deselect":"Select"} ${item.file.name}`} title={item.selected?"Deselect file":"Select file"} aria-pressed={item.selected} disabled={busy} onClick={()=>onToggleSelected(item.id)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40">
        {item.selected?<Check className="h-4 w-4 text-blue-600" aria-hidden="true"/>:<Square className="h-4 w-4" aria-hidden="true"/>}
      </button>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" aria-label={`${item.expanded?"Collapse":"Expand"} ${item.file.name}`} aria-expanded={item.expanded} onClick={()=>onToggleExpanded(item.id)}
          className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1 rounded text-left text-sm font-bold text-slate-950">
          <span className="truncate">{item.file.name}</span>{item.expanded?<ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true"/>:<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true"/>}
        </button>
        <span data-testid="receipt-status" role="status" className={clsx("inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold leading-4",failed?"bg-rose-100 text-rose-800":ready?"bg-emerald-100 text-emerald-800":item.extraction?"bg-amber-100 text-amber-900":"bg-blue-50 text-blue-800")}
          title={item.extraction&&!ready?"Open the receipt to correct highlighted fields":undefined}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true"/>{statusLabel(item)}</span>
      </div>
      <div className="flex shrink-0 gap-1">
        <IconButton label={`Preview ${item.file.name}`} onClick={event=>{event.currentTarget.focus();onPreview(item.id);}} tone="preview"><Eye className="h-4 w-4" aria-hidden="true"/></IconButton>
        <IconButton label={`Delete ${item.file.name}`} disabled={busy} onClick={()=>onDelete(item.id)} tone="delete"><Trash2 className="h-4 w-4" aria-hidden="true"/></IconButton>
      </div>
    </div>
    {item.expanded&&<>
      <ExpandedReceiptDetails item={item} onFieldChange={onFieldChange} onLineChange={onLineChange} onAddLine={onAddLine} onRemoveLine={onRemoveLine}/>
      {failed&&<div className="border-t border-slate-100 px-4 py-2"><button disabled={busy} onClick={()=>onRetry(item.id)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"><RotateCcw className="h-4 w-4" aria-hidden="true"/>Retry</button></div>}
    </>}
    {item.status==="extracting"&&<div role="progressbar" aria-label={`Extracting ${item.file.name}`} aria-valuetext="Waiting for extraction result" className="extraction-progress absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-2xl bg-blue-100"><span aria-hidden="true" className="extraction-progress-segment absolute inset-y-0 left-0 w-1/3 rounded-full bg-blue-600"/></div>}
  </article>;
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
    <div aria-label="Batch actions" className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm">
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
            <button type="button" disabled={!canDownloadSelected} onClick={onDownload} className="min-h-11 rounded-xl border border-slate-900 bg-slate-950 px-3 py-2 text-sm font-bold text-white transition enabled:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40" title={canDownloadSelected ? "Export selected expenses" : "Select a valid receipt to export"}>
              <Download className="mr-2 inline h-4 w-4" aria-hidden="true" />Export expenses CSV ({eligibleCount})
            </button>
          {canDownloadSelected && <button aria-label="Export JSON" title="Export provenance JSON" onClick={onJson} className="min-h-11 min-w-11 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">JSON</button>}
          {(hasExtractable || busy) && <button
            type="button"
            disabled={!canExtractSelected}
            onClick={onExtract}
            className={clsx("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed", busy ? "bg-blue-50 text-blue-700" : "bg-blue-600 text-white enabled:hover:bg-blue-700 disabled:bg-slate-300 disabled:opacity-40")}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Extracting…" : canExtractSelected ? `Extract ${extractCount} ${extractCount === 1 ? "file" : "files"}` : "Extract"}
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
  const [archives,setArchives] = useState<ArchiveSource[]|null>(null);
  const [queueRun, setQueueRun] = useState<{ completed: number; total: number; stopping: boolean; stopped: boolean } | null>(null);
  const itemsRef = useRef<ReceiptQueueItem[]>([]);

  const selectedItems = useMemo(() => items.filter((item) => item.selected), [items]);
  const selectedExtractableItems = useMemo(
    () => selectedItems.filter((item) => extractableStatuses.includes(item.status)),
    [selectedItems]
  );
  const completeSelectedItems = useMemo(() => selectedItems.filter(isExportable), [selectedItems]);
  const canAddMore = !legacy && hydrated && !busy && !addingFiles && !archives && items.length < maxFiles;
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
    }).catch(() => setErrorMessage("Saved data could not be opened. Keep this tab open and export your expenses before leaving."))
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated || !storageReady.current) return;
    writeBatch(items).catch(() => setErrorMessage("Could not save on this device. Keep this tab open and export your expenses before leaving."));
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

  async function prepareFiles(files:FileList|null) {
    if(legacy||!files?.length||uploadInProgress.current||busy||!hydrated||archives)return;
    const selected=Array.from(files);
    if(!selected.some(isZip)){await handleFiles(selected);return;}
    uploadInProgress.current=true;setAddingFiles(true);setErrorMessage(null);
    try{
      if(selected.reduce((size,file)=>size+file.size,0)>maxArchiveBytes)throw new Error("Select up to 25 MB at a time.");
      const {inspectArchive}=await import("@/lib/receipt-archive");const sources:ArchiveSource[]=[];const archiveErrors:string[]=[];const direct=selected.filter(file=>!isZip(file));
      for(const file of selected.filter(isZip)){
        try{const bytes=new Uint8Array(await file.arrayBuffer());sources.push({name:file.name,bytes,entries:inspectArchive(bytes)});}
        catch(error){archiveErrors.push(`${file.name}: ${error instanceof Error?error.message:"Could not open this ZIP. Try an unencrypted ZIP file."}`);}
      }
      uploadInProgress.current=false;
      if(direct.length)await handleFiles(direct);
      if(sources.reduce((count,source)=>count+source.entries.length,0)>200)throw new Error("Select ZIP files containing no more than 200 entries in total.");
      if(sources.length)setArchives(sources);
      if(archiveErrors.length)setErrorMessage(current=>[current,...archiveErrors].filter(Boolean).join(" "));
    }catch(error){setErrorMessage(error instanceof Error?error.message:"Could not open this ZIP. Try an unencrypted ZIP file.");}
    finally{uploadInProgress.current=false;setAddingFiles(false);}
  }

  function closeArchives(){setArchives(null);requestAnimationFrame(()=>document.getElementById(itemsRef.current.length?"receipt-add-upload":"receipt-upload")?.focus());}

  async function handleFiles(files: FileList | File[] | null) {
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
    if (legacy || archives || uploadInProgress.current || busy || itemsRef.current.length > maxFiles - 2) return;
    setQueueRun(null);
    const samples = [sampleReceipt("Sample cafe", "12.50", "12.50", "Client meeting"), sampleReceipt("Sample stationery", "28.00", "23.00", "Office supplies")];
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
      progress: 0,
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


      updateItem(id, (current) => ({
        ...current,
        status: "extracted",
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

  function updateLine(id:string,index:number,field:keyof EditableLineItem,value:string) {
    updateItem(id,item=>({...item,editedAt:Date.now(),lineItems:itemLines(item).map((line,i)=>i===index?{...line,[field]:value}:line)}));
  }
  function addLine(id:string) {
    const current=items.find(item=>item.id===id);
    if(!current)return;
    const count=itemLines(current).length;
    updateItem(id,item=>({...item,editedAt:Date.now(),lineItems:[...itemLines(item),{name:"",quantity:"",price:""}]}));
    requestAnimationFrame(()=>document.getElementById(`${id}-item-${count}-name`)?.focus());
  }
  function removeLine(id:string,index:number) {
    updateItem(id,item=>({...item,editedAt:Date.now(),lineItems:itemLines(item).filter((_,i)=>i!==index)}));
    requestAnimationFrame(()=>document.getElementById(`${id}-add-item`)?.focus());
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
    setRemovedToast("Receipts cleared.");
    setPreviewItemId(null);
    setItems([]);
    setQueueRun(null);
    if (legacy) window.location.replace("https://receipt-to-form-syahmiharith.vercel.app/");
  }

  function downloadSelected() {
    const payload = completeSelectedItems.map(buildDownloadPayload).filter(Boolean);
    if (!payload.length) return;
    const csv = expensesCsv(completeSelectedItems.map((item) => ({ id: item.id, source: item.file.name, values: item.formValues, reviewedAt: previousReviewTimestamp(item), items: itemLines(item) })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "expenses.csv"; link.click(); URL.revokeObjectURL(url);
    setRemovedToast("CSV export started.");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <section className="mx-auto max-w-5xl px-4 py-6 space-y-3 text-sm [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:rounded-lg [&_button]:border [&_button]:border-slate-300 [&_button]:bg-white [&_button]:px-3 [&_button]:py-2 [&_button]:font-semibold [&_button:disabled]:opacity-40 [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-blue-500">
        <h1 className="text-2xl font-bold">Receipts in. Expenses ready.</h1>
        <p className="max-w-2xl text-slate-600">Extract the details, make any corrections, and export to your spreadsheet.</p>

        <div className="flex flex-wrap items-center gap-2">
        {items.length > 0 && <button title="Add two synthetic receipts" disabled={legacy || !hydrated || busy || addingFiles || Boolean(archives) || items.length > 3} onClick={loadSamples}><Files className="mr-2 inline h-4 w-4" aria-hidden="true" />Try samples</button>}
        {(items.length > 0 || errorMessage) && <button aria-label="Clear all saved receipts" title="Clear all receipts saved in this browser" disabled={!hydrated || busy || addingFiles || Boolean(archives)} onClick={clearSavedData}>Clear all</button>}
        {addingFiles && <p role="status">Checking selected receipts…</p>}
        {busy && queueRun && queueRun.completed < queueRun.total - 1 && <button aria-label={queueRun?.stopping ? "Stopping after current receipt" : "Stop queue after current receipt"} disabled={queueRun?.stopping} onClick={() => { stopRequested.current = true; setQueueRun((run) => run && ({ ...run, stopping: true })); }}><Square className="mr-2 inline h-4 w-4" aria-hidden="true" />{queueRun?.stopping ? "Stopping…" : "Stop queue"}</button>}
        </div>
        {queueRun && <p role="status" className="text-slate-600">{queueRun.completed} of {queueRun.total} processed{queueRun.stopped ? " · Stopped" : ""}</p>}
        {!hydrated && <p role="status" className="text-slate-600">Loading saved receipts…</p>}
        {removedToast && <p role="status" className="text-slate-600">{removedToast}</p>}
        {legacy && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3">You are recovering receipts saved at the old address. Finish reviewing and export them here. Saved work stays here until cleared or expired. <a className="underline font-semibold" href="https://receipt-to-form-syahmiharith.vercel.app/">Open the main app</a></div>}
      </section>
      <main className="flex flex-1 flex-col px-4 pb-4 pt-5 sm:px-6 lg:px-8">
        {archives&&<ArchivePicker sources={archives} slots={Math.max(0,maxFiles-items.length)} onCancel={closeArchives} onAdd={async selection=>{
          const {extractArchive}=await import("@/lib/receipt-archive");const files:File[]=[];
          for(let index=0;index<archives.length;index++)if(selection[index].length)files.push(...await extractArchive(archives[index],selection[index]));
          await handleFiles(files);closeArchives();
        }}/>}

        {items.length === 0 ? (
          <div className={clsx("flex flex-col items-center justify-center gap-4",!archives&&"min-h-[calc(100vh-10rem)]")}>
            {errorMessage ? (
              <div className="w-full max-w-3xl rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
                {errorMessage}
              </div>
            ) : null}
            {!archives&&<UploadDropzone canAddMore={canAddMore && hydrated && !busy} onFiles={prepareFiles} />}
            {!archives&&<button title="Add two synthetic receipts" disabled={legacy || !hydrated || busy || addingFiles || Boolean(archives)} onClick={loadSamples} className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40"><Files className="mr-2 inline h-4 w-4" aria-hidden="true" />Try samples</button>}
          </div>
        ) : (
          <section className="mx-auto w-full min-w-0 max-w-5xl">
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
                  onLineChange={updateLine}
                  onAddLine={addLine}
                  onRemoveLine={removeLine}
                  onRetry={(id) => { void extractSelected([id]); }}
                  busy={busy||addingFiles||Boolean(archives)}
                />
              ))}
            </div>
          </section>
        )}

        {items.length > 0 ? (
          <div className="mt-auto w-full min-w-0 pt-6"><FloatingBatchFooter
            fileCount={items.length}
            busy={busy}
            selectedCount={selectedItems.length}
            canAddMore={canAddMore && hydrated && !busy}
            canExtractSelected={!busy && !addingFiles && !archives && selectedExtractableItems.length > 0}
            extractCount={selectedExtractableItems.length}
            canDownloadSelected={completeSelectedItems.length > 0}
            onSelectToggle={() => {
              const shouldSelect = selectedItems.length !== items.length;
              setItems((current) => current.map((item) => ({ ...item, selected: shouldSelect, resultSeen: true })));
            }}
            onFiles={prepareFiles}
            onExtract={() => { void extractSelected(); }}
            hasExtractable={items.some((item) => extractableStatuses.includes(item.status))}
            eligibleCount={completeSelectedItems.length}
            onJson={() => { downloadJson("expenses.json", completeSelectedItems.map(buildDownloadPayload)); setRemovedToast("JSON export started."); }}
            onDownload={downloadSelected}
          /></div>
        ) : null}

        {previewItem ? <ReceiptPreviewModal item={previewItem} onClose={closePreview} /> : null}


      </main>
      <ProductFooter />
    </div>
  );
}
