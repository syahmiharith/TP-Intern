import {describe,it,expect} from 'vitest';
import {extractionItems,lineItemErrors} from '@/lib/line-items';
import {expensesCsv} from '@/lib/expense-workflow';
import {emptyReceiptForm} from '@/lib/receipt';
describe('live line item contracts',()=>{
 it('supports fractional quantities, free items and negative discount prices',()=>{
  expect(lineItemErrors({name:'Weighted produce',quantity:'0.375',price:'2.50'},'USD')).toEqual({});
  expect(lineItemErrors({name:'Discount',quantity:'',price:'-2.00'},'USD')).toEqual({});
  expect(lineItemErrors({name:'Gift',quantity:'1',price:'0'},'JPY')).toEqual({});
 });
 it('rejects exponent prices, bad currency precision and non-positive quantities',()=>{
  expect(lineItemErrors({name:'',quantity:'0',price:'1e3'},'USD')).toEqual({name:'Enter an item name.',quantity:'Enter a positive quantity.',price:'Enter a decimal price.'});
  expect(lineItemErrors({name:'Coffee',quantity:'1',price:'2.50'},'JPY').price).toBeTruthy();
 });
 it('converts source nulls to unknown blanks without inventing amounts',()=>{
  expect(extractionItems({merchantName:null,receiptType:null,date:null,currency:null,totalAmount:null,confidence:'low',notes:[],items:[{name:'Unreadable',quantity:null,value:null}]})).toEqual([{name:'Unreadable',quantity:'',price:''}]);
 });
 it('exports exact line strings and does not fabricate a review timestamp',()=>{
  const csv=expensesCsv([{id:'source',source:'receipt.png',values:{...emptyReceiptForm,currency:'USD',totalAmount:'3.00'},items:[{name:'=Formula',quantity:'1.25',price:'2.00'}]}]);
  expect(csv).toContain('reviewed timestamp,items');expect(csv).toContain('""price"":""2.00""');expect(csv).toContain('""quantity"":""1.25""');
 });
});
