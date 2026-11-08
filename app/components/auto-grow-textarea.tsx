"use client";

import { useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "rows" | "wrap"> & { value: string };

export function AutoGrowTextarea({ value, ...props }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fitContent = useCallback(() => {
    const element = textarea.current;
    if (!element) return;
    // Reset before measuring so deleting text can shrink the field as well.
    element.style.height = "0px";
    const style = getComputedStyle(element);
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    element.style.height = `${Math.max(44, element.scrollHeight + borders)}px`;
  }, []);

  useLayoutEffect(fitContent, [value, fitContent]);
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    let width = -1;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      fitContent();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitContent]);

  return <textarea {...props} ref={textarea} rows={1} wrap="soft" value={value} />;
}
