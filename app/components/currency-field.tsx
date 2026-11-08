"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { currentCurrencies } from "@/lib/currencies";

// Current ISO codes, independent of the browser's historical currency catalogue.
const names = new Intl.DisplayNames(["en"], { type: "currency" });
export const currencies = currentCurrencies.map(({ code, name }) => ({
  code, name: names.of(code) === code ? name : names.of(code) ?? name
}));

export function CurrencyField({ id, value, error, onChange }: {
  id: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const query = searching ? value.trim().toLowerCase() : "";
  const options = useMemo(() => currencies.filter(({ code, name }) =>
    code.toLowerCase().includes(query) || name.toLowerCase().includes(query)), [query]);

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    setSearching(false);
    setActive(-1);
  }

  return <div className="relative space-y-1" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={id} className="text-xs font-semibold text-slate-700">Currency</label>
    <div className="relative">
      <input ref={input} id={id} role="combobox" autoComplete="off" spellCheck={false}
        aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 && options[active] ? `${id}-${options[active].code}` : undefined}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        value={value} placeholder="Search currencies"
        onFocus={() => { setOpen(true); setSearching(false); setActive(-1); }}
        onClick={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value); setSearching(true); setOpen(true); setActive(-1); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((current) => options.length ? Math.max(0, Math.min(options.length - 1,
              current < 0 ? (event.key === "ArrowDown" ? 0 : options.length - 1) : current + (event.key === "ArrowDown" ? 1 : -1))) : -1);
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            const option = options[active >= 0 ? active : 0];
            if (option) choose(option.code);
          } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
          else if (event.key === "Tab") setOpen(false);
        }}
        className={clsx("min-h-11 w-full rounded-lg border bg-white px-2.5 py-1.5 pr-10 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100", error ? "border-rose-300 bg-rose-50" : "border-slate-200")}
      />
      <button type="button" tabIndex={-1} aria-label="Show currencies" aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { if (open) setOpen(false); else { input.current?.focus(); setSearching(false); setActive(-1); setOpen(true); } }}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-500 hover:bg-slate-100">
        <ChevronDown className={clsx("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
    </div>
    {open && <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Currencies"
      className="absolute right-0 z-30 max-h-60 w-[min(20rem,calc(100vw-4rem))] overflow-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
      {options.map(({ code, name }, index) => <li key={code} id={`${id}-${code}`} role="option"
        aria-selected={value.trim().toUpperCase() === code} data-active={index === active}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(code)}
        className={clsx("flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-100", index === active && "bg-blue-50 text-blue-900")}>
        <span className="w-8 shrink-0 font-semibold">{code}</span>
        <span className="min-w-0 flex-1 text-xs text-slate-600">{name}</span>
        {value.trim().toUpperCase() === code && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />}
      </li>)}
      {!options.length && <li role="presentation" className="px-2 py-3 text-sm text-slate-500">No currencies found.</li>}
    </ul>}
    {error && <p id={`${id}-error`} className="text-xs font-medium text-rose-600">{error}</p>}
  </div>;
}
