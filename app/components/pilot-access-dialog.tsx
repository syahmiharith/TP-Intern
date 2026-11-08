"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, X } from "lucide-react";

export function PilotAccessDialog({onClose,onAuthorized}:{onClose:()=>void;onAuthorized:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const [code,setCode]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  useEffect(()=>{const element=dialog.current;element?.showModal();input.current?.focus();return()=>element?.close();},[]);
  async function submit(event:React.FormEvent){
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    try{
      const response=await fetch("/api/pilot-access",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({code}),signal:AbortSignal.timeout(5000)});
      const body=await response.json();
      if(!response.ok||body.authorized!==true){setError(body.error||"Could not verify this pilot code.");return;}
      setCode("");onAuthorized();
    }catch{setError("Could not verify your code. Try again.");}
    finally{setBusy(false);}
  }
  return <dialog ref={dialog} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} aria-labelledby="pilot-title" aria-describedby="pilot-description" className="w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border-0 p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/35">
    <div className="flex items-center justify-between gap-3"><h2 id="pilot-title" className="text-lg font-bold">Pilot access</h2><button type="button" onClick={onClose} disabled={busy} aria-label="Close pilot access" title="Close" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40"><X className="h-4 w-4" aria-hidden="true"/></button></div>
    <p id="pilot-description" className="mt-1 text-sm text-slate-600">Live extraction is by invitation. Samples are open to everyone.</p>
    <form onSubmit={submit} className="mt-5"><label htmlFor="pilot-code" className="text-sm font-semibold">Invite code</label><input ref={input} id="pilot-code" type="password" value={code} onChange={event=>setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={100} required disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error?"pilot-error":undefined} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"/>
      {error&&<p id="pilot-error" role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy||!code.trim()} aria-busy={busy} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 font-semibold text-white enabled:hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40">Continue{busy?<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/>:<ArrowRight className="h-4 w-4" aria-hidden="true"/>}</button>
    </form>
  </dialog>;
}
