import { currentCurrencies } from "./currencies";
import type { ReceiptExtraction } from "./receipt";

export type EditableLineItem = { name:string; quantity:string; price:string };
export function extractionItems(extraction:ReceiptExtraction|null):EditableLineItem[] {
  return extraction?.items.map(item=>({name:item.name,quantity:item.quantity===null?"":String(item.quantity),price:item.value===null?"":String(item.value)}))??[];
}
export function currencyMinorUnits(currency:string) {
  const code=currency.trim().toUpperCase();
  return currentCurrencies.find(item=>item.code===code)?.minorUnits ?? new Intl.NumberFormat("en",{style:"currency",currency:/^[A-Z]{3}$/.test(code)?code:"USD"}).resolvedOptions().maximumFractionDigits ?? 2;
}
export function lineItemErrors(item:EditableLineItem,currency:string) {
  const errors:Partial<Record<keyof EditableLineItem,string>>={};
  if(!item.name.trim())errors.name="Enter an item name.";
  if(item.quantity && (!/^\d+(\.\d+)?$/.test(item.quantity)||Number(item.quantity)<=0||!Number.isFinite(Number(item.quantity))))errors.quantity="Enter a positive quantity.";
  if(item.price && (!/^-?\d+(\.\d+)?$/.test(item.price)||!Number.isFinite(Number(item.price))))errors.price="Enter a decimal price.";
  else if((item.price.split(".")[1]?.length??0)>currencyMinorUnits(currency))errors.price="Check currency decimals.";
  return errors;
}
