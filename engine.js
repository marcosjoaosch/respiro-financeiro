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
 for(const p of s.plans){if(p.seriesId!==undefined&&(typeof p.seriesId!=='string'||!p.seriesId||p.seriesId.length>100))throw Error('Repetição inválida.');if(p.repeatEndMonth!==undefined&&!validMonth(p.repeatEndMonth))throw Error('Mês final da repetição inválido.');}
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

const validMonth=m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const monthNumber=m=>Number(m.slice(0,4))*12+Number(m.slice(5,7))-1;
export function addMonths(month,count){
 if(!validMonth(month)||!Number.isInteger(count)||count<0||count>119)throw Error('Confira o mês inicial e a quantidade (1 a 120 meses).');
 const n=monthNumber(month)+count,year=Math.floor(n/12);
 if(year>9999)throw Error('Mês final inválido.');
 return String(year).padStart(4,'0')+'-'+String(n%12+1).padStart(2,'0');
}
const normalizedTitle=t=>t.trim().normalize('NFC').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
export function savePlan(s,record,{endMonth=null,endsAtFinalMonth=false}={}){
 const next=structuredClone(s),original=s.plans.find(p=>p.id===record.id);
 if(original&&original.kind!==record.kind)throw Error('O tipo de uma previsão existente não pode mudar.');
 const duplicate=s.plans.find(p=>p.id!==record.id&&p.month===record.month&&p.kind===record.kind&&normalizedTitle(p.title)===normalizedTitle(record.title));
 if(duplicate)throw Error('Já existe uma previsão com esse nome e tipo neste mês. Abra Editar nela para evitar contar duas vezes.');
 if(original&&paidFor(s,original)>record.amount+(original.kind==='invoice'?amountFor(s,original)-original.amount:0))throw Error('A previsão não pode ficar abaixo do valor já registrado.');
 const source={...original,...record};
 if(original)next.plans[next.plans.findIndex(p=>p.id===record.id)]=source;else next.plans.push(source);
 const report={months:1,created:original?0:1,kept:0,removed:[],protected:[]};
 if(endMonth!==null){
  if(!validMonth(record.month)||!validMonth(endMonth))throw Error('Informe o mês inicial e o último mês da repetição.');
  const count=monthNumber(endMonth)-monthNumber(record.month)+1;
  if(count<1||count>120)throw Error('O último mês deve ser igual ou posterior ao inicial, com no máximo 120 meses.');
  report.months=count;
  const seriesId=original?.seriesId||id(),names=new Set([normalizedTitle(record.title),normalizedTitle(original?.title||record.title)]);
  const matches=p=>p.kind===record.kind&&(p.seriesId===seriesId||(!p.seriesId&&names.has(normalizedTitle(p.title))));
  const day=record.dueDate?Number(record.dueDate.slice(8,10)):null;
  source.seriesId=seriesId;source.repeatEndMonth=endMonth;
  for(let i=1;i<count;i++){
   const month=addMonths(record.month,i),existing=next.plans.filter(p=>matches(p)&&p.month===month);
   if(existing.length>1)throw Error('Há mais de uma previsão com esse nome em '+month+'. Confira esse mês antes de repetir.');
   if(existing.length){Object.assign(existing[0],{seriesId,repeatEndMonth:endMonth});report.kept++;continue;}
   const lastDay=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
   next.plans.push({id:id(),title:record.title,kind:record.kind,amount:record.amount,month,dueDate:day?month+'-'+String(Math.min(day,lastDay)).padStart(2,'0'):null,dateConfirmed:false,seriesId,repeatEndMonth:endMonth});
   report.created++;
  }
  if(endsAtFinalMonth){
   next.plans=next.plans.filter(p=>{
    if(!matches(p)||p.month<=endMonth||p.month<monthOf(today()))return true;
    if(next.actuals.some(a=>a.planId===p.id)||next.cards.some(c=>c.invoiceId===p.id)){report.protected.push(p);return true;}
    report.removed.push(p);return false;
   });
  }
 }
 validateState(next);return {state:next,report};
}

// Somente comparação em memória: não cria previsões, compras nem pagamentos.
export function simulatePurchase(s,input,asOf=today()){
 validateState(s);
 const {total,method}=input;
 if(!Number.isSafeInteger(total)||total<=0||total>100000000000)throw Error('Informe o preço total final da compra.');
 if(!['cash','card'].includes(method))throw Error('Escolha a forma de pagamento.');
 const currentMonth=monthOf(asOf),costs=[],warnings=[];
 let firstMonth,firstInvoice=null;
 if(method==='cash'){
  if(!validDate(input.date)||input.date<asOf)throw Error('Escolha uma data de pagamento a partir de hoje.');
  firstMonth=monthOf(input.date);costs.push({month:firstMonth,date:input.date,amount:total});
 }else{
  firstInvoice=s.plans.find(p=>p.id===input.invoiceId&&p.kind==='invoice');
  if(!firstInvoice||firstInvoice.month<currentMonth)throw Error('Escolha a primeira fatura, deste mês em diante.');
  firstMonth=firstInvoice.month;
  const amounts=installmentAmounts(total,input.count);
  amounts.forEach((amount,i)=>{
   const month=addMonths(firstMonth,i);
   const invoices=s.plans.filter(p=>p.kind==='invoice'&&p.month===month),candidates=invoices.filter(p=>p.title===firstInvoice.title);
   const invoice=i===0?firstInvoice:candidates.length===1?candidates[0]:invoices.length===1?invoices[0]:null;
   costs.push({month,amount,date:invoice?.dateConfirmed?invoice.dueDate:null});
  });
 }
 const baseline=projection(s),baseMap=new Map(baseline.map(p=>[p.month,p]));
 const lastMonth=[costs.at(-1).month,...baseline.filter(p=>p.month>=currentMonth).map(p=>p.month)].sort().at(-1);
 const horizon=monthNumber(lastMonth)-monthNumber(currentMonth)+1;
 if(horizon<1||horizon>120)throw Error('Esta simulação precisa ficar dentro dos próximos 120 meses.');
 let baseCash=baseline.filter(p=>p.month<currentMonth).at(-1)?.cash??s.opening.cash,spent=0;
 const rows=[];
 for(let i=0;i<horizon;i++){
  const month=addMonths(currentMonth,i),p=baseMap.get(month),cost=costs.filter(c=>c.month===month).reduce((n,c)=>n+c.amount,0);
  if(p)baseCash=p.cash;spent+=cost;
  rows.push({month,cost,beforeFlow:p?.flow??0,afterFlow:(p?.flow??0)-cost,beforeCash:baseCash,afterCash:baseCash-spent,reserve:p?.reserve??rows.at(-1)?.reserve??s.opening.reserve,covered:!!p});
 }
 const uncovered=rows.filter(r=>!r.covered);
 if(uncovered.length)warnings.push('Há meses sem planejamento cadastrado. Complete rendas e contas desses meses antes de decidir.');
 if(!s.opening.confirmed)warnings.push('Confirme teu saldo inicial em Ajustes.');
 const pending=s.plans.filter(p=>p.month<=lastMonth&&remaining(s,p)>0);
 const unconfirmed=pending.filter(p=>!p.dueDate||!p.dateConfirmed);
 const overdue=pending.filter(p=>p.dueDate&&p.dueDate<asOf);
 const missingInvoices=costs.filter(c=>!c.date);
 let timing={ready:false,minimumCash:null,minimumDate:null};
 if(unconfirmed.length||missingInvoices.length)warnings.push('Confirme os vencimentos e as datas dos recebimentos para avaliar o caixa entre as quinzenas.');
 if(overdue.length)warnings.push('Há previsões pendentes com data passada. Confira o que já foi pago ou recebido.');
 if(s.opening.confirmed&&!unconfirmed.length&&!missingInvoices.length&&!overdue.length&&!uncovered.length){
  const days=new Map();
  const event=(date,amount,income=false)=>{const d=days.get(date)||{income:0,out:0};if(income)d.income+=amount;else d.out+=amount;days.set(date,d);};
  pending.forEach(p=>event(p.dueDate,remaining(s,p),p.kind==='income'));
  costs.forEach(c=>event(c.date,c.amount));
  let cash=balance(s,asOf).cash,minimumCash=cash,minimumDate=asOf;
  for(const [date,d] of [...days].sort(([a],[b])=>a.localeCompare(b))){cash-=d.out;if(cash<minimumCash){minimumCash=cash;minimumDate=date;}cash+=d.income;}
  timing={ready:true,minimumCash,minimumDate};
 }
 let limit=null;
 if(method==='card'){
  if(input.cardLimit!==null&&input.cardLimit!==undefined){
   if(!Number.isSafeInteger(input.cardLimit)||input.cardLimit<0)throw Error('Confira o limite disponível no cartão.');
   limit={available:input.cardLimit,enough:input.cardLimit>=total};
  }else warnings.push('Limite do cartão não informado. Confira o valor disponível no banco.');
 }
 const negativeMonths=rows.filter(r=>r.afterCash<0),negativeFlows=rows.filter(r=>r.afterFlow<0);
 if(negativeFlows.length)warnings.push('Há meses em que as saídas superam as entradas. Eles dependem de sobras acumuladas.');
 const shortfall=negativeMonths.length>0||(timing.ready&&timing.minimumCash<0)||limit?.enough===false;
 return {rows,costs,total,firstMonth,lastPurchaseMonth:costs.at(-1).month,warnings,timing,limit,negativeMonths,negativeFlows,status:shortfall?'shortfall':warnings.length||!timing.ready?'review':'projected',lowestMonth:rows.reduce((a,b)=>b.afterCash<a.afterCash?b:a),tightestMonth:rows.reduce((a,b)=>b.afterFlow<a.afterFlow?b:a)};
}
