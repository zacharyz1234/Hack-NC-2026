import {describe,it,expect} from 'vitest';
import {balance,spending,demoTransactions} from '../lib/finance';
describe('demo money updates',()=>{
 it('added purchases immediately reduce checking funds',()=>{const before=balance(demoTransactions,'checking');expect(balance([...demoTransactions,{id:'test',merchant:'Lunch',category:'Food & Drink',amount:-10,date:'2026-10-10',account:'checking'}],'checking')).toBe(before-10)});
 it('edited purchases update monthly spending',()=>{const before=spending(demoTransactions);expect(spending(demoTransactions.map(t=>t.id==='1'?{...t,amount:-16.5}:t))).toBe(before+10)});
 it('savings deposits increase only savings',()=>{const next=[...demoTransactions,{id:'deposit',merchant:'Deposit',category:'Savings',amount:100,date:'2026-10-10',account:'savings' as const}];expect(balance(next,'savings')).toBe(balance(demoTransactions,'savings')+100);expect(balance(next,'checking')).toBe(balance(demoTransactions,'checking'))});
});
