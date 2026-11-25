export const VERSION=1;
export const kinds=['income','expense','invoice','reserve','withdraw'];
export const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
export const monthOf=d=>d.slice(0,7);
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
export const id=()=>globalThis.crypto.randomUUID();
export function cents(value){
 let s=String(value).trim();
 if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
 if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Informe um valor positivo com até duas casas decimais.');
 const n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n)||n<=0)throw Error('O valor precisa ser maior que zero.');return n;
}
export function emptyState(){return {version:VERSION,opening:{date:today(),cash:0,reserve:0,confirmed:false},plans:[],actuals:[],cards:[],notes:[],loans:[],revision:0};}
export const amountFor=(s,p)=>p.amount+(p.kind==='invoice'?s.cards.filter(c=>c.invoiceId===p.id).reduce((n,c)=>n+c.amount,0):0);
export const paidFor=(s,p)=>s.actuals.filter(a=>a.planId===p.id).reduce((n,a)=>n+a.amount,0);
export const remaining=(s,p)=>Math.max(0,amountFor(s,p)-paidFor(s,p));
function signed(a){return a.kind==='income'||a.kind==='withdraw'?a.amount:-a.amount;}
export function balance(s,asOf=today()){
 let cash=s.opening.cash,reserve=s.opening.reserve;
 for(const a of s.actuals.filter(a=>a.date<=asOf)){cash+=signed(a);if(a.kind==='reserve')reserve+=a.amount;if(a.kind==='withdraw')reserve-=a.amount;}
 return {cash,reserve};
}
export function projection(s){
 const months=[...new Set([...s.plans.map(p=>p.month),...s.actuals.map(a=>monthOf(a.date))])].sort();
 let cash=s.opening.cash,reserve=s.opening.reserve;
 return months.map(month=>{
  let income=0,out=0,saving=0;
  for(const a of s.actuals.filter(a=>monthOf(a.date)===month)){if(a.kind==='income')income+=a.amount;else if(a.kind==='withdraw')saving-=a.amount;else if(a.kind==='reserve')saving+=a.amount;else out+=a.amount;}
  for(const p of s.plans){
   const effectiveMonth=p.dueDate?monthOf(p.dueDate):p.month;
   if(effectiveMonth!==month)continue;
   const n=remaining(s,p);if(p.kind==='income')income+=n;else if(p.kind==='reserve')saving+=n;else out+=n;
  }
  const flow=income-out-saving;cash+=flow;reserve+=saving;return {month,income,out,saving,flow,cash,reserve};
 });
}
export function spendable(s,asOf=today()){
 const cash=balance(s,asOf).cash;
 const next=s.plans.filter(p=>p.kind==='income'&&p.dueDate>asOf&&p.dateConfirmed&&remaining(s,p)>0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];
 if(!s.opening.confirmed)return {ready:false,reason:'Confirme teu saldo inicial em Ajustes.',cash};
 if(!next)return {ready:false,reason:'Confirme a data do próximo recebimento em Contas.',cash};
 const relevant=s.plans.filter(p=>p.month<=monthOf(next.dueDate)&&remaining(s,p)>0);
 const unresolved=relevant.filter(p=>p.kind!=='income'&&(!p.dueDate||!p.dateConfirmed));
 const missingIncome=relevant.some(p=>p.kind==='income'&&(!p.dueDate||!p.dateConfirmed)&&p.month<=monthOf(next.dueDate));
 if(unresolved.length||missingIncome)return {ready:false,reason:'Confirme as datas das contas e recebimentos até '+next.dueDate.split('-').reverse().join('/')+'.',cash,next,unresolved};
 const committed=relevant.filter(p=>p.kind!=='income'&&p.dueDate<=next.dueDate).reduce((n,p)=>n+remaining(s,p),0);
 return {ready:true,cash,committed,available:cash-committed,next};
}
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
export function validateState(s){
 if(!s||s.version!==VERSION||!s.opening||!validDate(s.opening.date)||s.opening.date>today()||typeof s.opening.confirmed!=='boolean')throw Error('Backup incompatível ou saldo inicial inválido.');
 for(const k of ['cash','reserve'])if(!Number.isSafeInteger(s.opening[k])||s.opening[k]<0)throw Error('Saldo inicial inválido.');
 for(const k of ['plans','actuals','cards','notes','loans'])if(!Array.isArray(s[k])||s[k].length>6000)throw Error('Arquivo inválido ou grande demais.');
 const ids=new Set();for(const r of [...s.plans,...s.actuals,...s.cards]){if(typeof r.id!=='string'||ids.has(r.id))throw Error('Registro duplicado.');ids.add(r.id);if(!Number.isSafeInteger(r.amount)||r.amount<0||r.amount>100000000000)throw Error('Valor inválido.');if(typeof r.title!=='string'||!r.title.trim()||r.title.length>180)throw Error('Descrição inválida.');}
 const pmap=new Map(s.plans.map(p=>[p.id,p]));
 for(const p of s.plans){if(!['income','expense','invoice','reserve'].includes(p.kind)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month)||typeof p.dateConfirmed!=='boolean'||(p.dateConfirmed&&!p.dueDate)||(p.dueDate&&(!validDate(p.dueDate)||monthOf(p.dueDate)!==p.month)))throw Error('Previsão inválida.');}
 for(const a of s.actuals){if(!kinds.includes(a.kind)||!validDate(a.date)||a.date<s.opening.date||a.date>today())throw Error('Lançamento realizado precisa estar entre o saldo inicial e hoje.');if(a.planId&&(!pmap.has(a.planId)||pmap.get(a.planId).kind!==a.kind))throw Error('Vínculo de conta inválido.');}
 for(const c of s.cards){if(!pmap.has(c.invoiceId)||pmap.get(c.invoiceId).kind!=='invoice'||!validDate(c.date)||c.date>today()||c.date<s.opening.date)throw Error('Compra ou fatura inválida.');}
 for(const n of s.notes)if(typeof n!=='string'||n.length>2000)throw Error('Nota inválida.');
 for(const l of s.loans)if(typeof l.title!=='string'||typeof l.note!=='string'||!Number.isSafeInteger(l.amount)||l.amount<0)throw Error('Consignado inválido.');
 let saved=s.opening.reserve;for(const a of [...s.actuals].sort((a,b)=>a.date.localeCompare(b.date))){if(a.kind==='reserve')saved+=a.amount;if(a.kind==='withdraw')saved-=a.amount;if(saved<0)throw Error('A reserva fica negativa no histórico. Confira os depósitos e retiradas.');}
 return s;
}
export function addActual(s,a){
 const next=structuredClone(s);if(a.planId){const p=next.plans.find(p=>p.id===a.planId);if(!p||p.kind!==a.kind)throw Error('Conta incompatível.');if(a.amount>remaining(next,p))throw Error('Valor acima do restante. Ajuste a previsão antes de registrar.');}
 next.actuals.push(a);validateState(next);
 const r=balance(next,a.date);if(r.reserve<0)throw Error('Não há esse valor na reserva.');return next;
}
export function summary(s){return {plans:s.plans.length,actuals:s.actuals.length,cards:s.cards.length};}
export function installmentAmounts(total,count){if(!Number.isSafeInteger(total)||!Number.isInteger(count)||count<1||count>36||total<count)throw Error('Confira o valor e as parcelas.');const each=Math.floor(total/count);return Array.from({length:count},(_,i)=>i===count-1?total-each*(count-1):each);}
