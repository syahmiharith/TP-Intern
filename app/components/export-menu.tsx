"use client";
import { useEffect, useLayoutEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Braces, Download, FileSpreadsheet } from "lucide-react";

export function ExportMenu({disabled,onCsv,onJson}:{disabled:boolean;onCsv:()=>void;onJson:()=>void}) {
  const [open,setOpen]=useState(false);
  const [below,setBelow]=useState(false);
  const [alignLeft,setAlignLeft]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const menu=useRef<HTMLDivElement>(null);
  const id=useId();
  const visible=open&&!disabled;
  useEffect(()=>{
    if(!visible)return;
    function outside(event:PointerEvent){if(!root.current?.contains(event.target as Node))setOpen(false);}
    document.addEventListener("pointerdown",outside);
    return()=>document.removeEventListener("pointerdown",outside);
  },[visible]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  useLayoutEffect(()=>{
    if(!visible)return;
    function position(){
      const button=trigger.current?.getBoundingClientRect();
      if(!button)return;
      setAlignLeft(button.right-(menu.current?.offsetWidth??176)<8);
      setBelow(button.top<120);
    }
    position();window.addEventListener("resize",position);
    return()=>window.removeEventListener("resize",position);
  },[visible]);
  function focusItem(index:number){menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[index]?.focus();}
  function show(index=0){
    setBelow((trigger.current?.getBoundingClientRect().top??0)<120);
    setOpen(true);
    requestAnimationFrame(()=>focusItem(index));
  }
  function close(){trigger.current?.focus();setOpen(false);}
  function navigate(event:KeyboardEvent<HTMLDivElement>){
    const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')??[]);
    const current=items.indexOf(document.activeElement as HTMLButtonElement);
    if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();}
    else if(event.key==="Tab"){close();}
    else if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){
      event.preventDefault();
      const next=event.key==="Home"?0:event.key==="End"?items.length-1:(current+(event.key==="ArrowDown"?1:-1)+items.length)%items.length;
      focusItem(next);
    }
  }
  function choose(action:()=>void){close();action();}
  const option="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus:bg-blue-50 focus:text-blue-900 focus:outline-none";
  return <div ref={root} className="relative" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <button ref={trigger} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={visible} aria-controls={visible?id:undefined}
      onClick={()=>visible?close():show()}
      onKeyDown={event=>{if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();show(event.key==="ArrowUp"?1:0);}}}
      title={disabled?"Select a valid receipt to export":"Export selected expenses"}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-900 bg-slate-950 px-3 py-2 text-sm font-bold text-white transition enabled:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
      <Download className="h-4 w-4" aria-hidden="true"/>Export
    </button>
    {visible&&<div ref={menu} id={id} role="menu" aria-label="Export format" onKeyDown={navigate}
      className={`absolute z-50 w-44 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1 shadow-lg ${alignLeft?"left-0":"right-0"} ${below?"top-full mt-2":"bottom-full mb-2"}`}>
      <button type="button" role="menuitem" tabIndex={-1} onClick={()=>choose(onCsv)} className={option}><FileSpreadsheet className="h-4 w-4" aria-hidden="true"/>CSV</button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={()=>choose(onJson)} className={option}><Braces className="h-4 w-4" aria-hidden="true"/>JSON</button>
    </div>}
  </div>;
}
