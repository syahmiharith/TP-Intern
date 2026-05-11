"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileImage, Loader2, ReceiptText, RefreshCcw, Sparkles, UploadCloud } from "lucide-react";
import clsx from "clsx";
import {
  ReceiptExtraction,
  ReceiptFormValues,
  emptyReceiptForm,
  extractionToFormValues,
  validateReceiptForm
} from "@/lib/receipt";

type FieldErrors = Partial<Record<keyof ReceiptFormValues, string>>;

type ExtractApiResponse = {
  data?: ReceiptExtraction;
  error?: string;
};

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];

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

function Field({
  id,
  label,
  value,
  error,
  placeholder,
  type = "text",
  onChange
}: {
  id: keyof ReceiptFormValues;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  type?: string;
  onChange: (field: keyof ReceiptFormValues, value: string) => void;
}) {
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(id, event.target.value)}
        className={clsx(
          "w-full rounded-2xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100",
          error ? "border-rose-300" : "border-slate-200"
        )}
      />
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
    </label>
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasFormData = useMemo(
    () => Object.values(formValues).some((value) => value.trim().length > 0),
    [formValues]
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setErrorMessage(null);
    setSubmittedData(null);
    setExtraction(null);
    setFieldErrors({});

    if (!file) return;

    if (!acceptedTypes.includes(file.type)) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setErrorMessage("Please upload a JPG, PNG, or WEBP receipt image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setErrorMessage("Please upload an image smaller than 5MB.");
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
  }

  async function extractReceipt() {
    if (!selectedFile) {
      setErrorMessage("Upload a receipt image first.");
      return;
    }

    setIsExtracting(true);
    setErrorMessage(null);
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
      setErrorMessage(error instanceof Error ? error.message : "Receipt extraction failed.");
    } finally {
      setIsExtracting(false);
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateReceiptForm(formValues);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) return;

    const normalizedSubmission: ReceiptFormValues = {
      merchantName: formValues.merchantName.trim(),
      date: formValues.date.trim(),
      totalAmount: formValues.totalAmount.trim(),
      currency: formValues.currency.trim().toUpperCase(),
      notes: formValues.notes.trim()
    };

    window.localStorage.setItem("latestReceiptSubmission", JSON.stringify(normalizedSubmission, null, 2));
    setSubmittedData(normalizedSubmission);
  }

  function resetApp() {
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
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-soft backdrop-blur md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
              <Sparkles className="h-3.5 w-3.5" /> AI Intern Assessment
            </div>
            <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
              Receipt-to-Form Auto-Fill Web App
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Upload a receipt image, extract the required fields with generative AI, review the auto-filled form, then submit the final structured data.
            </p>
          </div>
          <button
            type="button"
            onClick={resetApp}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" /> Reset
          </button>
        </div>

        {errorMessage ? (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none" />
            <p>{errorMessage}</p>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                  <FileImage className="h-5 w-5 text-blue-600" /> Receipt Image
                </h2>
                <p className="mt-1 text-sm text-slate-500">JPG, PNG, or WEBP up to 5MB.</p>
              </div>
            </div>

            <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center transition hover:border-blue-300 hover:bg-blue-50/60">
              <UploadCloud className="mb-4 h-10 w-10 text-blue-600" />
              <span className="text-sm font-semibold text-slate-800">Click to upload receipt</span>
              <span className="mt-1 text-xs text-slate-500">Use a clear, readable image for better extraction.</span>
              <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
            </label>

            {selectedFile ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">{selectedFile.name}</p>
                <p>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : null}

            {previewUrl ? (
              <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Receipt preview" className="max-h-[540px] w-full object-contain" />
              </div>
            ) : null}

            <button
              type="button"
              onClick={extractReceipt}
              disabled={!selectedFile || isExtracting}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isExtracting ? "Extracting receipt data..." : "Extract Data with AI"}
            </button>
          </section>

          <section className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-soft">
            <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                  <ReceiptText className="h-5 w-5 text-blue-600" /> Review Auto-Filled Form
                </h2>
                <p className="mt-1 text-sm text-slate-500">AI output is editable before submission.</p>
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

            <form className="space-y-4" onSubmit={submitForm}>
              <Field
                id="merchantName"
                label="Merchant Name"
                value={formValues.merchantName}
                error={fieldErrors.merchantName}
                placeholder="Example: Starbucks"
                onChange={updateField}
              />
              <Field
                id="date"
                label="Date"
                value={formValues.date}
                error={fieldErrors.date}
                placeholder="YYYY-MM-DD"
                type="date"
                onChange={updateField}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="totalAmount"
                  label="Total Amount"
                  value={formValues.totalAmount}
                  error={fieldErrors.totalAmount}
                  placeholder="Example: 25.90"
                  type="number"
                  onChange={updateField}
                />
                <Field
                  id="currency"
                  label="Currency"
                  value={formValues.currency}
                  error={fieldErrors.currency}
                  placeholder="MYR"
                  onChange={updateField}
                />
              </div>

              <label className="block space-y-2" htmlFor="notes">
                <span className="text-sm font-semibold text-slate-700">Notes</span>
                <textarea
                  id="notes"
                  value={formValues.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
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
                <CheckCircle2 className="h-4 w-4" /> Submit Extracted Data
              </button>
            </form>
          </section>
        </div>

        {submittedData ? (
          <section className="mt-6 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-soft">
            <div className="mb-3 flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
              <h2 className="text-lg font-bold">Submission saved locally</h2>
            </div>
            <p className="mb-4 text-sm text-emerald-700">
              This MVP stores the latest submission in browser localStorage and displays the final JSON below.
            </p>
            <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
              {JSON.stringify(submittedData, null, 2)}
            </pre>
          </section>
        ) : null}
      </section>
    </main>
  );
}
