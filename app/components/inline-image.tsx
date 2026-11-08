"use client";
import { useEffect, useRef, useState } from "react";
import { RotateCw, ZoomIn, ZoomOut } from "lucide-react";

export function InlineImage({ source, filename }: { source:string; filename:string }) {
  const viewport=useRef<HTMLDivElement>(null);
  const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const [rotation,setRotation]=useState(0);
  const [zoom,setZoom]=useState(1);
  const [failed,setFailed]=useState(false);
  const [size,setSize]=useState({width:400,height:500});
  const [box,setBox]=useState({width:1,height:1});
  useEffect(()=>{const el=viewport.current;if(!el)return;const observer=new ResizeObserver(()=>setBox({width:el.clientWidth,height:el.clientHeight}));observer.observe(el);return()=>observer.disconnect();},[]);
  const sideways=rotation%180!==0;
  const width=sideways?size.height:size.width;
  const height=sideways?size.width:size.height;
  const fit=Math.min(box.width/width,box.height/height);
  const button="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40";
  return <aside className="min-w-0 rounded-xl border border-slate-200 bg-white p-2 lg:sticky lg:top-20 lg:self-start">
    <div className="flex items-center justify-between gap-2">
      <h3 className="pl-1 text-xs font-semibold text-slate-700">Receipt image</h3>
      <div className="flex">
        <button type="button" className={button} disabled={failed||zoom<=1} aria-label="Zoom out image" title="Zoom out" onClick={()=>setZoom(value=>Math.max(1,value-.5))}><ZoomOut className="h-4 w-4" aria-hidden="true"/></button>
        <button type="button" className={button} disabled={failed||zoom>=3} aria-label="Zoom in image" title="Zoom in" onClick={()=>setZoom(value=>Math.min(3,value+.5))}><ZoomIn className="h-4 w-4" aria-hidden="true"/></button>
        <button type="button" className={button} disabled={failed} aria-label="Rotate image clockwise" title="Rotate clockwise" onClick={()=>setRotation(value=>value+90)}><RotateCw className="h-4 w-4" aria-hidden="true"/></button>
      </div>
    </div>
    <div ref={viewport} role="region" aria-label="Receipt image viewer" tabIndex={0}
      className="relative h-72 overflow-auto overscroll-contain rounded-lg bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 lg:h-96"
      style={{touchAction:zoom>1?"none":"auto",cursor:zoom>1?"grab":"default"}}
      onKeyDown={event=>{const directions:Record<string,ScrollToOptions>={ArrowLeft:{left:-40},ArrowRight:{left:40},ArrowUp:{top:-40},ArrowDown:{top:40}};if(directions[event.key]){event.preventDefault();event.currentTarget.scrollBy(directions[event.key]);}}}
      onPointerDown={event=>{if(zoom<=1||event.button!==0)return;const el=event.currentTarget;el.focus();drag.current={x:event.clientX,y:event.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(event.pointerId);}}
      onPointerMove={event=>{if(!drag.current)return;event.currentTarget.scrollTo(drag.current.left+drag.current.x-event.clientX,drag.current.top+drag.current.y-event.clientY);}}
      onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
      onDoubleClick={()=>{if(!failed)setZoom(value=>value===1?2:1);}}>
      {failed?<p role="alert" className="p-4 text-sm text-slate-600">Image unavailable. Try the full preview or another file.</p>:<div className="relative" style={{width:Math.max(box.width,width*fit*zoom),height:Math.max(box.height,height*fit*zoom)}}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Local receipt blobs cannot be optimized. */}
        <img src={source} alt={`Inline preview of ${filename}`} draggable={false} onLoad={event=>setSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})} onError={()=>setFailed(true)}
          className="absolute left-1/2 top-1/2 max-w-none select-none object-contain" style={{width:size.width*fit*zoom,height:size.height*fit*zoom,transform:`translate(-50%,-50%) rotate(${rotation}deg)`}}/>
      </div>}
    </div>
  </aside>;
}
