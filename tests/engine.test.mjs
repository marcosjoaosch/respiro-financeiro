import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,today,cents,balance,projection,remaining,addActual,spendable,validateState,installmentAmounts,savePlan,addMonths,simulatePurchase} from '../engine.js';
const make=()=>{const s=emptyState();s.opening={date:today(),cash:100000,reserve:0,confirmed:true};return s;};
const plan=(s,overrides={})=>{const p={id:'p',title:'Conta',kind:'expense',amount:20000,month:today().slice(0,7),dueDate:today(),dateConfirmed:true,...overrides};s.plans.push(p);return p;};
const actual=(overrides={})=>({id:'a',title:'Pagamento',kind:'expense',amount:20000,date:today(),planId:'p',...overrides});
test('BRL é convertido sem perder centavos ou aceitar negativos',()=>{assert.equal(cents('1.219,53'),121953);assert.equal(cents('423.14'),42314);assert.throws(()=>cents('-50'));assert.throws(()=>cents('1,234'));});
test('previsão não movimenta saldo real',()=>{const s=make();plan(s);assert.equal(balance(s).cash,100000);assert.equal(projection(s)[0].cash,80000);});
test('pagamento vinculado baixa saldo sem duplicar despesa prevista',()=>{let s=make();const p=plan(s);s=addActual(s,actual());assert.equal(remaining(s,p),0);assert.equal(balance(s).cash,80000);assert.equal(projection(s)[0].cash,80000);assert.throws(()=>addActual(s,actual({id:'b',amount:1})));});
test('pagamento parcial conserva apenas o restante previsto',()=>{let s=make();const p=plan(s);s=addActual(s,actual({amount:7500}));assert.equal(remaining(s,p),12500);assert.equal(balance(s).cash,92500);assert.equal(projection(s)[0].cash,80000);});
test('despesa fora do planejamento reduz a previsão',()=>{let s=make();plan(s);s=addActual(s,actual({planId:null,amount:5000}));assert.equal(projection(s)[0].cash,75000);});
test('reserva é transferência e retirada não cria dinheiro',()=>{let s=make();plan(s,{kind:'reserve',amount:10000});s=addActual(s,actual({kind:'reserve',amount:10000}));assert.deepEqual(balance(s),{cash:90000,reserve:10000});assert.equal(projection(s)[0].reserve,10000);s=addActual(s,actual({id:'r',kind:'withdraw',amount:4000,planId:null}));assert.deepEqual(balance(s),{cash:94000,reserve:6000});assert.throws(()=>addActual(s,actual({id:'x',kind:'withdraw',amount:6001,planId:null})));});
test('compra no cartão só sai do caixa no pagamento da fatura',()=>{let s=make();const p=plan(s,{kind:'invoice'});s.cards.push({id:'c',invoiceId:p.id,title:'Compra nova',date:today(),amount:5000});assert.equal(balance(s).cash,100000);assert.equal(projection(s)[0].out,25000);s=addActual(s,actual({kind:'invoice',amount:25000}));assert.equal(balance(s).cash,75000);assert.equal(projection(s)[0].out,25000);});
test('parcelas somam o total com ajuste de centavos',()=>{assert.deepEqual(installmentAmounts(10000,3),[3333,3333,3334]);assert.equal(installmentAmounts(300017,10).reduce((a,b)=>a+b),300017);assert.throws(()=>installmentAmounts(1,2));});
test('disponível não inclui salário futuro e inclui contas no dia do depósito',()=>{const s=make(),d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+5);const next=d.toISOString().slice(0,10);plan(s,{id:'income',kind:'income',amount:250000,month:next.slice(0,7),dueDate:next});plan(s,{id:'expense',dueDate:next,month:next.slice(0,7)});const result=spendable(s);assert.equal(result.available,80000);assert.equal(result.cash,100000);});
test('saldo ou datas não confirmados bloqueiam valor livre',()=>{const s=make();s.opening.confirmed=false;assert.equal(spendable(s).ready,false);s.opening.confirmed=true;assert.equal(spendable(s).ready,false);const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);const date=d.toISOString().slice(0,10);plan(s,{id:'i',kind:'income',dueDate:date,month:date.slice(0,7)});plan(s,{id:'e',dueDate:null});assert.equal(spendable(s).ready,false);});
test('importação rejeita duplicados, datas inválidas, vínculos incorretos e realizados futuros',()=>{const s=make();plan(s);assert.doesNotThrow(()=>validateState(s));const a=structuredClone(s);a.plans.push({...a.plans[0]});assert.throws(()=>validateState(a));const b=structuredClone(s);b.plans[0].dueDate='2026-02-31';assert.throws(()=>validateState(b));assert.throws(()=>addActual(s,actual({planId:'inexistente'})));assert.throws(()=>addActual(s,actual({date:'2099-01-01'})));});
const recurring=(overrides={})=>({id:'monthly',title:'Conta de exemplo',kind:'expense',amount:25000,month:'2027-01',dueDate:'2027-01-31',dateConfirmed:true,...overrides});
test('repetição inclui o último mês sem antecipar saídas de caixa',()=>{
 const s=make(),{state:n,report}=savePlan(s,recurring(),{endMonth:'2027-10',endsAtFinalMonth:true});
 assert.equal(n.plans.length,10);assert.equal(report.created,10);assert.equal(n.plans.at(-1).month,'2027-10');assert.equal(balance(n).cash,balance(s).cash);assert.equal(s.plans.length,0);assert.equal(projection(n).reduce((t,m)=>t+m.out,0),250000);
});
test('dia 31 é ajustado em fevereiro e volta a 31 em março, incluindo ano bissexto',()=>{
 const {state:n}=savePlan(make(),recurring(),{endMonth:'2027-03'});
 assert.deepEqual(n.plans.map(p=>p.dueDate),['2027-01-31','2027-02-28','2027-03-31']);assert.equal(n.plans[1].dateConfirmed,false);
 assert.equal(savePlan(make(),recurring({month:'2028-01',dueDate:'2028-01-31'}),{endMonth:'2028-02'}).state.plans[1].dueDate,'2028-02-29');
});
test('previsões existentes são reutilizadas com valores, datas e pagamentos preservados',()=>{
 const s=make(),record=recurring({month:monthOfToday(),dueDate:today()});s.plans.push(record);
 s.actuals.push(actual({planId:record.id,amount:1000}));s.plans.push(recurring({id:'future',month:addMonths(record.month,1),dueDate:null,dateConfirmed:false,amount:18000}));
 const {state:n,report}=savePlan(s,record,{endMonth:addMonths(record.month,2)});
 assert.equal(report.created,1);assert.equal(report.kept,1);assert.equal(n.plans.length,3);assert.deepEqual(n.actuals,s.actuals);assert.equal(n.plans.find(p=>p.id==='future').amount,18000);assert.equal(n.plans.find(p=>p.id==='future').dueDate,null);
 const again=savePlan(n,record,{endMonth:addMonths(record.month,2)});assert.equal(again.state.plans.length,3);assert.equal(again.report.created,0);
});
function monthOfToday(){return today().slice(0,7);}
test('encerramento remove somente previsões posteriores sem vínculos e sem afetar outras contas',()=>{
 const s=make(),record=recurring();s.plans=[record,recurring({id:'later',month:'2027-11',dueDate:null,dateConfirmed:false}),recurring({id:'other',title:'Outra conta',month:'2027-11',dueDate:null,dateConfirmed:false})];
 const {state:n,report}=savePlan(s,record,{endMonth:'2027-10',endsAtFinalMonth:true});assert.equal(report.removed.length,1);assert.equal(n.plans.some(p=>p.id==='later'),false);assert.equal(n.plans.some(p=>p.id==='other'),true);
 const kept=savePlan(s,record,{endMonth:'2027-10'});assert.equal(kept.state.plans.some(p=>p.id==='later'),true);
});
test('encerramento preserva parcelas de cartão vinculadas, inclusive com valor zero',()=>{
 const s=make(),record=recurring({kind:'invoice'});s.plans=[record,recurring({id:'later',kind:'invoice',month:'2027-11',dueDate:null,dateConfirmed:false})];s.cards.push({id:'card',invoiceId:'later',title:'Compra',amount:0,date:today()});
 const {state:n,report}=savePlan(s,record,{endMonth:'2027-10',endsAtFinalMonth:true});assert.equal(report.removed.length,0);assert.equal(report.protected.length,1);assert.deepEqual(n.cards,s.cards);assert.equal(n.plans.some(p=>p.id==='later'),true);
});
test('encerramento preserva histórico de pagamentos e meses antigos',()=>{
 const s=make(),record=recurring({month:'2026-01',dueDate:null,dateConfirmed:false});s.plans=[record,recurring({id:'past',month:'2026-02',dueDate:null,dateConfirmed:false}),recurring({id:'paid',month:monthOfToday(),dueDate:null,dateConfirmed:false})];s.actuals.push(actual({planId:'paid',amount:1000}));
 const {state:n,report}=savePlan(s,record,{endMonth:'2026-01',endsAtFinalMonth:true});assert.equal(n.plans.length,3);assert.deepEqual(n.actuals,s.actuals);assert.equal(report.protected.length,1);
});
test('edição de apenas um mês preserva os demais e bloqueia duplicação acidental',()=>{
 const s=make(),record=recurring();s.plans=[record,recurring({id:'next',month:'2027-02',dueDate:null,dateConfirmed:false})];
 const n=savePlan(s,{...record,amount:30000}).state;assert.equal(n.plans[1].amount,25000);assert.throws(()=>savePlan(s,recurring({id:'new',title:'  CONTA DE EXEMPLO  '})),/Já existe/);
});
test('intervalos inválidos, datas incompatíveis e repetições ambíguas são rejeitados',()=>{
 const s=make(),record=recurring();assert.throws(()=>savePlan(s,record,{endMonth:'2026-12'}));assert.throws(()=>savePlan(s,record,{endMonth:'2027-13'}));assert.throws(()=>savePlan(s,record,{endMonth:'2037-01'}));assert.throws(()=>addMonths('2027-01',120));assert.equal(addMonths('2027-12',1),'2028-01');
 assert.throws(()=>savePlan(s,recurring({dueDate:'2027-02-01'}),{endMonth:'2027-02'}));
 s.plans=[recurring({id:'x',month:'2027-02',dueDate:null,dateConfirmed:false}),recurring({id:'y',month:'2027-02',dueDate:null,dateConfirmed:false})];assert.throws(()=>savePlan(s,record,{endMonth:'2027-03'}),/mais de uma/);
});
const simulationFixture=()=>{
 const s=make(),month=today().slice(0,7),d=today();s.opening.cash=100000;
 s.plans=[{id:'salary-sim',title:'Renda de teste',kind:'income',amount:200000,month,dueDate:d,dateConfirmed:true},{id:'invoice-sim',title:'Cartão de teste',kind:'invoice',amount:50000,month,dueDate:d,dateConfirmed:true}];return s;
};
test('simulação à vista muda somente comparação, sem mutar saldo, reserva ou dados',()=>{
 const s=simulationFixture(),before=structuredClone(s),r=simulatePurchase(s,{method:'cash',total:10000,date:today()});
 assert.deepEqual(s,before);assert.equal(r.rows[0].beforeFlow-r.rows[0].afterFlow,10000);assert.equal(r.rows[0].beforeCash-r.rows[0].afterCash,10000);assert.equal(r.rows[0].reserve,0);assert.equal(balance(s).cash,100000);
});
test('simulação parcelada soma exatamente o total, sem duplicar faturas existentes',()=>{
 const s=simulationFixture(),month=today().slice(0,7);for(let i=1;i<3;i++)s.plans.push({id:'future-'+i,title:'Cartão de teste',kind:'invoice',amount:30000,month:addMonths(month,i),dueDate:null,dateConfirmed:false});
 const before=structuredClone(s),r=simulatePurchase(s,{method:'card',total:10000,count:3,invoiceId:'invoice-sim',cardLimit:20000});
 assert.deepEqual(r.costs.map(c=>c.amount),[3333,3333,3334]);assert.equal(r.rows.reduce((t,p)=>t+p.cost,0),10000);assert.equal(r.rows.at(-1).beforeCash-r.rows.at(-1).afterCash,10000);assert.deepEqual(s,before);assert.equal(r.limit.enough,true);
});
test('simulação avisa sobre datas pendentes, meses sem previsão e limite insuficiente',()=>{
 const s=simulationFixture(),r=simulatePurchase(s,{method:'card',total:10000,count:2,invoiceId:'invoice-sim',cardLimit:5000});
 assert.equal(r.status,'shortfall');assert.equal(r.timing.ready,false);assert.equal(r.rows.at(-1).covered,false);assert.ok(r.warnings.some(w=>w.includes('sem planejamento')));
});
test('simulação identifica falta de caixa entre recebimentos mesmo com sobra mensal',()=>{
 const s=simulationFixture();s.opening.cash=1000;s.plans[1].amount=100;s.plans[0].dueDate=today();
 const r=simulatePurchase(s,{method:'cash',total:2000,date:today()});assert.ok(r.rows[0].afterCash>0);assert.equal(r.timing.ready,true);assert.ok(r.timing.minimumCash<0);assert.equal(r.status,'shortfall');
});
test('simulação identifica déficit acumulado e não retira dinheiro da reserva',()=>{
 const s=simulationFixture();s.opening.reserve=900000;const r=simulatePurchase(s,{method:'cash',total:400000,date:today()});assert.equal(r.status,'shortfall');assert.ok(r.negativeMonths.length);assert.equal(r.rows[0].reserve,900000);
});
test('simulação não certifica caixa quando faltam confirmação do saldo ou datas',()=>{
 const s=simulationFixture();s.opening.confirmed=false;s.plans[0].dateConfirmed=false;const r=simulatePurchase(s,{method:'cash',total:100,date:today()});assert.equal(r.timing.ready,false);assert.equal(r.status,'review');assert.ok(r.warnings.length>=2);
});
test('simulador rejeita entrada incompleta, fatura inválida e pagamento passado',()=>{
 const s=simulationFixture();assert.throws(()=>simulatePurchase(s,{total:0,method:'cash',date:today()}));assert.throws(()=>simulatePurchase(s,{total:100,method:''}));assert.throws(()=>simulatePurchase(s,{total:100,method:'cash',date:'2000-01-01'}));assert.throws(()=>simulatePurchase(s,{total:100,method:'card',invoiceId:'missing',count:2}));assert.throws(()=>simulatePurchase(s,{total:100,method:'card',invoiceId:'invoice-sim',count:0}));
});
