"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileImage,
  Loader2,
  ReceiptText,
  RefreshCcw,
  Sparkles,
  Trash2,
  UploadCloud
} from "lucide-react";
import clsx from "clsx";
import {
  ReceiptExtraction,
  ReceiptFormValues,
  emptyReceiptForm,
  extractionToFormValues,
  validateReceiptForm
} from "@/lib/receipt";

type FieldErrors = Partial<Record<keyof ReceiptFormValues, string>>;
type FlowState = "idle" | "file-selected" | "extracting" | "extracted" | "extract-error" | "submitting" | "submitted";

type ExtractApiResponse = {
  data?: ReceiptExtraction;
  error?: string;
};

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];

function formatFileSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function StepIndicator({ state }: { state: FlowState }) {
  const activeStep = state === "idle" || state === "file-selected" ? 1 : state === "extracting" ? 2 : 3;
  const steps = ["Upload receipt", "Extract with AI", "Review & submit"];

  return (
    <ol className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Receipt processing steps">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isActive = activeStep === stepNumber;
        const isComplete = activeStep > stepNumber;

        return (
          <li
            key={step}
            className={clsx(
              "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-all duration-200",
              isActive && "border-blue-200 bg-blue-50 text-blue-800 shadow-sm",
              isComplete && "border-emerald-200 bg-emerald-50 text-emerald-800",
              !isActive && !isComplete && "border-slate-200 bg-white/80 text-slate-500"
            )}
          >
            <span
              className={clsx(
                "flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold",
                isActive && "bg-blue-600 text-white",
                isComplete && "bg-emerald-600 text-white",
                !isActive && !isComplete && "bg-slate-100 text-slate-500"
              )}
              aria-hidden="true"
            >
              {isComplete ? <CheckCircle2 className="h-4 w-4" /> : stepNumber}
            </span>
            <span className="font-semibold">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ErrorMessage({ message, detail }: { message: string; detail?: string | null }) {
  return (
    <div
      className="mb-6 flex animate-[fadeSlideDown_200ms_ease-out] items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
      <div>
        <p className="font-semibold">{message}</p>
        {detail ? <p className="mt-1 text-rose-700">{detail}</p> : null}
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: ReceiptExtraction["confidence"] }) {
  if (!confidence) return null;

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize",
        confidence === "high" && "bg-emerald-100 text-emerald-700",
        confidence === "medium" && "bg-amber-100 text-amber-700",
        confidence === "low" && "bg-rose-100 text-rose-700"
      )}
    >
      {confidence} confidence
    </span>
  );
}

function ReceiptUploader({
  selectedFile,
  isExtracting,
  onFileChange,
  onRemove
}: {
  selectedFile: File | null;
  isExtracting: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/95 p-5 shadow-soft">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
          <FileImage className="h-5 w-5 text-blue-600" aria-hidden="true" /> Upload Receipt
        </h2>
        <p className="mt-1 text-sm text-slate-500">Start with a clear image so the AI can read the receipt fields.</p>
      </div>

      <input
        id="receipt-upload"
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChange}
        disabled={isExtracting}
      />
      <label
        htmlFor="receipt-upload"
        className={clsx(
          "flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ease-out hover:scale-[1.01] hover:border-blue-400 hover:bg-blue-50 hover:shadow-md",
          selectedFile ? "border-blue-200 bg-blue-50/70" : "border-slate-200 bg-slate-50"
        )}
      >
        <UploadCloud className="mb-4 h-11 w-11 text-blue-600" aria-hidden="true" />
        <span className="text-base font-bold text-slate-900">Drop your receipt here or click to upload</span>
        <span className="mt-2 text-sm text-slate-500">JPG, PNG, or WEBP up to 5MB</span>
      </label>

      {selectedFile ? (
        <div className="mt-4 animate-[fadeScaleIn_260ms_ease-out] rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-bold text-emerald-800">Receipt uploaded successfully</p>
              <p className="mt-1 text-emerald-700">
                {selectedFile.name} · {formatFileSize(selectedFile.size)}
              </p>
            </div>
            <div className="flex gap-2">
              <label
                htmlFor="receipt-upload"
                className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                Change receipt
              </label>
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReceiptPreview({
  previewUrl,
  selectedFile,
  isExtracting,
  onExtract
}: {
  previewUrl: string | null;
  selectedFile: File | null;
  isExtracting: boolean;
  onExtract: () => void;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/95 p-5 shadow-soft">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
            <ReceiptText className="h-5 w-5 text-blue-600" aria-hidden="true" /> Receipt Preview
          </h2>
          <p className="mt-1 text-sm text-slate-500">Verify the image before running extraction.</p>
        </div>
        {previewUrl ? (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open preview
          </a>
        ) : null}
      </div>

      <div className="relative overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50">
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Receipt preview"
              className="max-h-[520px] min-h-64 w-full animate-[fadeScaleIn_300ms_ease-out] object-contain"
            />
            {isExtracting ? (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 p-6 text-center text-white backdrop-blur-[2px]">
                <div>
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" aria-hidden="true" />
                  <p className="font-bold">Analyzing receipt...</p>
                  <p className="mt-1 text-sm text-slate-100">Detecting merchant, date, total, and currency.</p>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center text-slate-500">
            <FileImage className="mb-3 h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-semibold">No receipt selected yet.</p>
            <p className="mt-1 text-xs">Your preview will appear here after upload.</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onExtract}
        disabled={!selectedFile || isExtracting}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
      >
        {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
        {isExtracting ? "Extracting receipt data..." : "Extract Data with AI"}
      </button>
    </section>
  );
}

function ExtractionSkeleton() {
  return (
    <div className="space-y-4" aria-label="Analyzing receipt">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-bold">Analyzing receipt...</p>
        <p className="mt-1">Detecting merchant, date, total amount, and currency.</p>
      </div>
      {["Merchant name", "Date", "Total amount", "Currency"].map((label, index) => (
        <div key={label} className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <div
            className={clsx(
              "h-11 animate-pulse rounded-2xl bg-slate-200",
              index === 0 && "w-full",
              index === 1 && "w-3/4",
              index === 2 && "w-2/3",
              index === 3 && "w-1/2"
            )}
          />
        </div>
      ))}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  error,
  placeholder,
  type = "text",
  isAiFilled,
  onChange
}: {
  id: keyof ReceiptFormValues;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  type?: string;
  isAiFilled: boolean;
  onChange: (field: keyof ReceiptFormValues, value: string) => void;
}) {
  const errorId = `${id}-error`;

  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {isAiFilled ? "AI-filled · editable" : "Manual entry"}
        </span>
      </span>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(id, event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={clsx(
          "w-full rounded-2xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100",
          error ? "border-rose-300" : "border-slate-200"
        )}
      />
      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-xs font-medium text-rose-600">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> {error}
        </p>
      ) : null}
    </label>
  );
}

function ReviewForm({
  formValues,
  fieldErrors,
  extraction,
  isExtracting,
  hasFormData,
  onFieldChange,
  onSubmit
}: {
  formValues: ReceiptFormValues;
  fieldErrors: FieldErrors;
  extraction: ReceiptExtraction | null;
  isExtracting: boolean;
  hasFormData: boolean;
  onFieldChange: (field: keyof ReceiptFormValues, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isAiFilled = Boolean(extraction);

  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/95 p-5 shadow-soft">
      <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
            <ReceiptText className="h-5 w-5 text-blue-600" aria-hidden="true" /> Review Extracted Data
          </h2>
          <p className="mt-1 text-sm text-slate-500">Review and edit the AI-filled fields before submitting.</p>
        </div>
        <ConfidenceBadge confidence={extraction?.confidence} />
      </div>

      {extraction?.notes?.length ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-bold text-amber-900">AI notes</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
            {extraction.notes.map((note, index) => (
              <li key={`${note}-${index}`}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!hasFormData && !isExtracting ? (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Upload a receipt and run extraction. The required fields will appear here for review.
        </div>
      ) : null}

      {isExtracting ? (
        <ExtractionSkeleton />
      ) : (
        <form className={clsx("space-y-4", isAiFilled && "animate-[fadeSlideUp_300ms_ease-out]")} onSubmit={onSubmit}>
          <Field
            id="merchantName"
            label="Merchant Name"
            value={formValues.merchantName}
            error={fieldErrors.merchantName}
            placeholder="Example: Starbucks"
            isAiFilled={isAiFilled}
            onChange={onFieldChange}
          />
          <Field
            id="date"
            label="Date"
            value={formValues.date}
            error={fieldErrors.date}
            placeholder="YYYY-MM-DD"
            type="date"
            isAiFilled={isAiFilled}
            onChange={onFieldChange}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="totalAmount"
              label="Total Amount"
              value={formValues.totalAmount}
              error={fieldErrors.totalAmount}
              placeholder="Example: 25.90"
              type="number"
              isAiFilled={isAiFilled}
              onChange={onFieldChange}
            />
            <Field
              id="currency"
              label="Currency"
              value={formValues.currency}
              error={fieldErrors.currency}
              placeholder="MYR"
              isAiFilled={isAiFilled}
              onChange={onFieldChange}
            />
          </div>

          <label className="block space-y-2" htmlFor="notes">
            <span className="text-sm font-semibold text-slate-700">Notes</span>
            <textarea
              id="notes"
              value={formValues.notes}
              onChange={(event) => onFieldChange("notes", event.target.value)}
              placeholder="Optional review notes or AI uncertainty notes."
              rows={4}
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!hasFormData}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Submit Final Data
          </button>
        </form>
      )}
    </section>
  );
}

function SubmissionSummary({ data, onScanAnother }: { data: ReceiptFormValues; onScanAnother: () => void }) {
  return (
    <section className="mt-6 animate-[fadeSlideUp_300ms_ease-out] rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-5 shadow-soft">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-bold">Receipt data submitted successfully</h2>
            <p className="mt-1 text-sm text-emerald-700">The reviewed receipt data was saved locally for this demo.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onScanAnother}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Scan another receipt
        </button>
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        {[
          ["Merchant", data.merchantName],
          ["Date", data.date],
          ["Total", data.totalAmount],
          ["Currency", data.currency]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-emerald-200 bg-white/80 p-4">
            <dt className="text-xs font-bold uppercase tracking-wide text-emerald-700">{label}</dt>
            <dd className="mt-1 break-words text-sm font-bold text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>

      <details className="mt-4 rounded-2xl border border-emerald-200 bg-white/80 p-4">
        <summary className="cursor-pointer text-sm font-bold text-emerald-800">View submitted JSON</summary>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </section>
  );
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<ReceiptFormValues>(emptyReceiptForm);
  const [extraction, setExtraction] = useState<ReceiptExtraction | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submittedData, setSubmittedData] = useState<ReceiptFormValues | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const hasFormData = useMemo(
    () => Object.values(formValues).some((value) => value.trim().length > 0),
    [formValues]
  );

  const flowState: FlowState = submittedData
    ? "submitted"
    : isSubmitting
      ? "submitting"
      : isExtracting
        ? "extracting"
        : errorMessage && selectedFile
          ? "extract-error"
          : extraction
            ? "extracted"
            : selectedFile
              ? "file-selected"
              : "idle";

  function clearReceipt() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setFormValues(emptyReceiptForm);
    setExtraction(null);
    setFieldErrors({});
    setSubmittedData(null);
    setErrorMessage(null);
    setErrorDetail(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setErrorMessage(null);
    setErrorDetail(null);
    setSubmittedData(null);
    setExtraction(null);
    setFieldErrors({});

    if (!file) return;

    if (!acceptedTypes.includes(file.type)) {
      clearReceipt();
      setErrorMessage("Unsupported file type. Please upload a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      clearReceipt();
      setErrorMessage("File is too large. Please upload an image up to 5MB.");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setFormValues(emptyReceiptForm);
  }

  function updateField(field: keyof ReceiptFormValues, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSubmittedData(null);
  }

  async function extractReceipt() {
    if (!selectedFile) {
      setErrorMessage("Upload a receipt image before extracting data.");
      setErrorDetail(null);
      return;
    }

    setIsExtracting(true);
    setErrorMessage(null);
    setErrorDetail(null);
    setSubmittedData(null);
    setFieldErrors({});

    try {
      const body = new FormData();
      body.append("receipt", selectedFile);

      const response = await fetch("/api/extract-receipt", {
        method: "POST",
        body
      });

      const payload = (await response.json()) as ExtractApiResponse;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "Receipt extraction failed.");
      }

      setExtraction(payload.data);
      setFormValues(extractionToFormValues(payload.data));
    } catch (error) {
      setErrorMessage("Could not extract receipt data. Please upload a clearer image or try another receipt.");
      setErrorDetail(error instanceof Error ? error.message : "Receipt extraction failed.");
    } finally {
      setIsExtracting(false);
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const errors = validateReceiptForm(formValues);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setIsSubmitting(false);
      return;
    }

    const normalizedSubmission: ReceiptFormValues = {
      merchantName: formValues.merchantName.trim(),
      date: formValues.date.trim(),
      totalAmount: formValues.totalAmount.trim(),
      currency: formValues.currency.trim().toUpperCase(),
      notes: formValues.notes.trim()
    };

    window.localStorage.setItem("latestReceiptSubmission", JSON.stringify(normalizedSubmission, null, 2));
    setSubmittedData(normalizedSubmission);
    setIsSubmitting(false);
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-soft backdrop-blur">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> TP Malaysia AI Intern Assessment
              </div>
              <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                AI Receipt Scanner for Instant Form Auto-Fill
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                Upload a receipt image and let AI extract the merchant, date, total amount, and currency into an editable form.
              </p>
            </div>
            <button
              type="button"
              onClick={clearReceipt}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Reset
            </button>
          </div>
        </div>

        <StepIndicator state={flowState} />

        {errorMessage ? <ErrorMessage message={errorMessage} detail={errorDetail} /> : null}

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <ReceiptUploader
              selectedFile={selectedFile}
              isExtracting={isExtracting}
              onFileChange={handleFileChange}
              onRemove={clearReceipt}
            />
            <ReceiptPreview
              previewUrl={previewUrl}
              selectedFile={selectedFile}
              isExtracting={isExtracting}
              onExtract={extractReceipt}
            />
          </div>

          <ReviewForm
            formValues={formValues}
            fieldErrors={fieldErrors}
            extraction={extraction}
            isExtracting={isExtracting}
            hasFormData={hasFormData}
            onFieldChange={updateField}
            onSubmit={submitForm}
          />
        </div>

        {submittedData ? <SubmissionSummary data={submittedData} onScanAnother={clearReceipt} /> : null}
      </section>
    </main>
  );
}
