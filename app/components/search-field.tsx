"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import clsx from "clsx";

type Option = { value: string; label: string; description?: string };
export function SearchField({ id, label, value, options, error, onChange, freeText = false }: {
  id: string; label: string; value: string; options: readonly Option[]; error?: string;
  onChange: (value: string) => void; freeText?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const matches = useMemo(() => options.filter(option => `${option.value} ${option.label} ${option.description ?? ""}`.toLowerCase().includes((query ?? "").trim().toLowerCase())), [options, query]);
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({block:"nearest"}); }, [active]);
  function close() { setOpen(false); setQuery(null); setActive(-1); }
  function choose(option: Option) { onChange(option.value); close(); }
  return <div className="relative space-y-1" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <label htmlFor={id} className="text-xs font-semibold text-slate-700">{label}</label>
    <div className="relative">
      <input ref={input} id={id} role="combobox" autoComplete="off" spellCheck={false}
        aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-activedescendant={open && active >= 0 && matches[active] ? `${id}-option-${active}` : undefined}
        value={query ?? (options.find(option => option.value === value)?.label ?? value)} placeholder={`Select ${label.toLowerCase()}`}
        onFocus={() => { setOpen(true); setQuery(null); setActive(-1); }} onClick={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); if (freeText) onChange(event.target.value); }}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive(current => matches.length ? Math.max(0, Math.min(matches.length - 1, current < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : current + (event.key === "ArrowDown" ? 1 : -1))) : -1);
          } else if (event.key === "Enter" && open) {
            event.preventDefault(); const option=matches[active >= 0 ? active : 0]; if(option) choose(option);
          } else if (event.key === "Escape") { event.preventDefault(); close(); }
          else if (event.key === "Tab") close();
        }}
        className={clsx("min-h-11 w-full rounded-lg border bg-white px-2.5 py-1.5 pr-10 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100",error ? "border-rose-300 bg-rose-50" : "border-slate-200")}/>
      <button type="button" tabIndex={-1} aria-label={`Show ${label.toLowerCase()} options`} aria-expanded={open}
        onMouseDown={event => event.preventDefault()} onClick={() => { if(open) close(); else {input.current?.focus();setOpen(true);} }}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-500 hover:bg-slate-100">
        <ChevronDown className={clsx("h-4 w-4 transition-transform",open && "rotate-180")} aria-hidden="true"/>
      </button>
    </div>
    {open && <ul ref={list} id={`${id}-list`} role="listbox" aria-label={`${label} options`} className="absolute left-0 right-0 z-30 max-h-60 overflow-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
      {matches.map((option,index)=><li key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value===value} data-active={active===index}
        onMouseDown={event=>event.preventDefault()} onClick={()=>choose(option)}
        className={clsx("flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-100",active===index&&"bg-blue-50 text-blue-900")}>
        <span className={clsx(option.description&&"w-8 shrink-0 font-semibold")}>{option.label}</span>
        {option.description&&<span className="min-w-0 flex-1 text-xs text-slate-600">{option.description}</span>}
        {option.value===value&&<Check className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true"/>}
      </li>)}
      {!matches.length&&<li role="presentation" className="px-2 py-3 text-sm text-slate-500">No matches.</li>}
    </ul>}
    {error&&<p id={`${id}-error`} className="text-xs font-medium text-rose-600">{error}</p>}
  </div>;
}
