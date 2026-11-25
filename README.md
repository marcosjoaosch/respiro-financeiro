# Respiro

Controle financeiro pessoal em português, adaptado para celular e computador.

- Saldo real separado de previsões.
- Recebimentos, despesas, faturas e reserva.
- Compras parceladas sem descontar duas vezes do caixa.
- Login Google e sincronização com Firebase Spark após configuração.
- Exportação e importação de backup JSON.

## Publicação

Site estático compatível com GitHub Pages: publicar `main`, pasta raiz.
Não precisa de dependências ou build.

## Firebase

Preencha `firebase-config.js` com a configuração pública do projeto Web.
Ative Google no Firebase Authentication e adicione o domínio do Pages aos domínios autorizados.
Crie Firestore Standard `(default)` em produção e publique `firestore.rules`.
O arquivo de regras é apenas um modelo bloqueado. Configure o identificador do proprietário diretamente nas regras privadas do console Firestore. Não publique identificadores de contas no código. A aplicação confia nas regras do banco para autorizar cada operação.
Não vincule Cloud Billing para usar esta versão no plano Spark.

## Dados pessoais

Este repositório contém apenas código e configurações públicas.
Importe os registros financeiros pelo aplicativo após entrar na conta.
Não envie planilhas, backups, chaves privadas ou arquivos de conta de serviço ao GitHub.
No modo local, os registros ficam apenas no navegador atual; não há sincronização.
No modo Firebase, as alterações precisam de internet e a sessão deve ser encerrada em computadores compartilhados.

## Limitações

O app não acessa bancos. Valores e vencimentos são atualizados manualmente.
A previsão não garante dinheiro antes de um vencimento sem confirmar as datas.
Backup por exportação manual. Limite interno de 800 KB de registros nesta versão.

## Ações em Contas

- **Pagar** registra uma despesa ou fatura já paga.
- **Receber** registra dinheiro que já entrou.
- **Guardar** registra dinheiro já separado para a reserva.
- **Editar** altera o valor ou a data de uma previsão, inclusive futura.

As datas de pagamentos realizados não podem estar no futuro.

## Contas mensais e prazo final

Em Contas, abra Nova previsão ou Editar numa conta existente. Em Repetir esta previsão, escolha um mês final (incluído) ou uma quantidade de meses (inclui o mês inicial; até 120).

O formulário mostra um resumo antes de salvar e pede confirmação para aplicar a repetição. Meses com o mesmo nome e tipo são reutilizados, mantendo valores, datas e registros. Meses que faltam recebem o valor informado. Vencimentos no dia 29, 30 ou 31 são ajustados ao último dia de meses mais curtos. Datas criadas ficam a confirmar.

A opção Esta conta termina no mês final retira apenas previsões posteriores sem registros, a partir do mês atual. O resumo lista os meses afetados; histórico de pagamentos e compras vinculadas é preservado. Desmarque a opção para apenas completar o intervalo sem encerrar as previsões seguintes.

Só este mês edita apenas a previsão aberta. A repetição altera o planejamento: não registra pagamentos e não movimenta saldo real. Os registros gerados são sincronizados como as demais previsões.

Verificação dos cálculos: `node --test tests/engine.test.mjs`.
