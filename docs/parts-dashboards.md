# Peça e Por Peça — implementação e verificação

Peça compara materiais de uma mesma unidade. Por Peça compara blocos para um material. A implementação mantém as rotas existentes de admin/almoxarifado, sessão Next, JWT Express, permissões individuais e escopo de estoque vigente (ambos os perfis autorizados possuem acesso geral; líder/funcionário são recusados). Não foi criado um novo escopo de filial ou almoxarife.

## Fontes e indicadores

| Indicador | Definição |
| --- | --- |
| Quantidade entregue | `stock_movements.kind='saida'`, com `request_id` e peça correspondentes a pedido `Entregue`, sem `transfer_id`/`return_id`; soma a quantidade de cada linha uma vez. A data é `requests.delivered_at`, confirmação do pedido, inclusive quando várias origens o atendem. Não é consumo efetivo nem data de entrega de cada parcela. |
| Anterior | Intervalo imediatamente anterior com exatamente o mesmo número de dias e os mesmos filtros. Diferença = atual − anterior. Percentual somente com anterior positivo; caso contrário, “Sem base percentual”. |
| Participação por bloco | Entregue do bloco / entregue do material na unidade e filtros vigentes. Inclui “Sem bloco identificado” quando o destino falta tanto no movimento quanto no pedido. Selecionar blocos altera o denominador, explicitado na tela/exportação. |
| Retiradas / média | `COUNT(DISTINCT request_id)` / entregue dividido por essa contagem. Linhas de vários almoxarifados do mesmo atendimento não aumentam a contagem. O sistema confirma a retirada por pedido; `batch_id` identifica submissão, não retirada. |
| Solicitada / entregue / pendente | Coorte separada de pedidos não cancelados/rejeitados **criados** no período. Quantidade base do pedido, baixas com entrega confirmada até a atualização e diferença ainda sem confirmação. Se algum pedido marcado Entregue não possui baixa vinculada, entregue/pendente agregados daquele bloco ficam indisponíveis. Com origem filtrada, a coorte considera pedidos reservados/atendidos naquela origem e informa que mostra o pedido inteiro. Não deve ser somada à série de entregas por data. |
| Devoluções | `return_records` conferidas, por `inspected_at` UTC; `created_at` é fallback para legado sem data de inspeção. Apto e Danificado separados, IDs e `request_id` disponíveis na origem; não alteram entregas de outro período. Origem filtrada exige vínculo a baixa naquela origem. Retorno sem vínculo continua visível sem esse filtro; não há rateio entre origens. |
| Saldo | Inventário físico atual por material/local ativo. Disponível desconta reservas e transferências solicitadas, agregadas antes de unir ao inventário. Mínimo local vem de `inventory.minimum_quantity`. Ausência de inventário não vira saldo zero. |
| Alerta | Atual maior que média de três períodos anteriores equivalentes × (1 + limiar/100); exige quantidade positiva em **cada** período. Limiar configurável de 10% a 500%, padrão 50%. Mostra quantidades, média, período e motivo; não atribui causas. Alertas da tabela são da página atual; exportação inclui todos os materiais filtrados. |

Datas seguem a base UTC do projeto: início inclusivo, fim exclusivo no dia seguinte. Os horários de origem são formatados pelo PostgreSQL, evitando conversão dependente do fuso do processo. Atualização é apresentada também em São Paulo. Todas as leituras do relatório acontecem em transação somente leitura com snapshot repetível.

Não são usadas quantidades estáticas `consumed_30`/`previous_30`, o total solicitado como substituto da baixa, nem transferências como entregas. Pedidos entregues sem baixa aparecem na qualidade da base e em aviso de cobertura incompleta. Não há soma entre unidades; conversão de embalagem já registrada na quantidade base do pedido não é aplicada novamente.

## Interface, serviços e exportação

Ranking usa `InsightChart` existente, com variante de barras sem anel/3D/animação. Evolução segue o SVG já utilizado nas dashboards, com até quatro séries, legenda, escala única e tabela diária acessível. Registros de origem abrem por barra, ponto, linha ou botão, mantêm os filtros e oferecem retorno/paginação de 50 linhas.

Filtros de período, unidade, grupo, origem, peça e destino (um ou vários blocos) atravessam os links entre telas. Requisições abortadas não atualizam o relatório; há debounce de 180 ms, nova tentativa e atualização após `marcon:workspace-updated` ou retorno de foco. Não há histórico bruto carregado no navegador, consultas por linha nem migração de índices sem evidência de plano de execução. Catálogo/opções permanecem cadastros atuais; tabelas de materiais têm páginas de 50.

PDF/XLSX usam o resultado autorizado de `/api/parts/consumption`, convertido no servidor Next pela biblioteca já instalada. Contêm **todos os resultados agregados filtrados**, metadados, materiais, blocos, séries selecionadas, pedidos, devoluções, distribuição, saldos e alertas; não incluem todas as linhas de origem. Exportação acima de 10.000 materiais é recusada para pedir um recorte menor. Séries continuam limitadas a quatro, como na tela.

Recomendação é uma leitura sob demanda de `/api/operations?planning=purchase`, com código/período/origem, exigindo a permissão existente de planejamento. Não duplica previsão nem cria movimentações. A base própria do planejamento e o limite de 50 locais ficam explícitos; o link abre o serviço completo. Proximidade permanece dependente da planta e de rotas válidas.

James reconhece “consulte dashboard peça” e “consulte dashboard por peça”, reutiliza o endpoint autenticado e aceita contexto/filtros, mudança de código/unidade e exportação. Percentuais e agregações não são calculados no cliente nem pelo modelo.

## Evidências de teste

`scripts/test-parts-consumption.mjs` usa PostgreSQL PGlite local persistido em `.validation`, aplica as migrações reais, fecha/reabre o banco e consulta o serviço gerado de produção. Não lê a conexão de produção. Para simular legado sem bloco, remove somente no banco isolado a obrigatoriedade de `requests.block_id`.

No recorte de teste 21–24/09/2026 UTC, consultas PostgreSQL independentes reconciliam **31 un**: P1 **11 un / 3 retiradas / 4 linhas**, P2 **20 un / 1 retirada**. P3 permanece separado em **80 kg**. P1 tem anterior zerado e **3 un de devoluções conferidas**, sem desconto retroativo. Duas origens atendem um pedido parcial; cancelamento e transferências não entram; o bloco ausente permanece visível. Selecionar somente A/B produz **9 un**, participação total 100%. São cobertos limites 00:00 e 23:59:59.999 UTC, coorte incompleta, reservas e alertas.

Também são verificados o middleware JWT e a rota Express reais (401 anônimo, 403 líder/funcionário/override bloqueado, 200 admin/almoxarifado), XLSX com células/percentuais reconciliados, texto numérico do PDF e parser de comandos do James.

`playwright.parts.config.ts` executa as telas reais em uma aplicação de inspeção **separada**, preparada por `scripts/prepare-parts-ui.mjs`, com o tema MARCON e o mesmo serviço/banco isolado. Cobre 375, 768 e 1440 px, investigação, teclado, evolução, filtros preservados, múltiplos blocos, resposta antiga, erro/repetição e download. O erro de permissão do planejamento é testado com resposta controlada; o serviço de previsão existente não é recalculado nesse banco.

Para reproduzir:

```powershell
npm install --prefix .validation --no-save --package-lock=false @electric-sql/pglite
node scripts/sync-workspace.mjs
node scripts/test-parts-consumption.mjs
node scripts/prepare-parts-ui.mjs
$env:PLAYWRIGHT_CHANNEL = 'msedge' # Ou um navegador Playwright instalado
npx playwright test -c playwright.parts.config.ts
npm --prefix backend test
npx eslint
npx tsc --noEmit
npm run build
```

Relatório de reconciliação: `.validation/parts-consumption/reconciliation.json`. Capturas: `test-results/parts-consumption/peca-*.png` e `por-peca-*.png`.

## Limitações e referências

Consumo na produção, perdas específicas, estornos com correlação, custo por entrega/método de valorização, conversões/snapshots históricos de unidade e filial vinculada não existem nessa base. Esses indicadores não foram fabricados. Preço de referência faltante é sinalizado; preço presente não valida valor consumido. Cobertura estimada nesta base fica indisponível. Importações duplicadas sem chave de origem não podem ser deduplicadas por suposição. Nenhum dado de produção foi alterado ou validado por esta tarefa.

A integração de leitura de sugestões está conectada ao serviço existente; o fluxo completo de previsão/planta e áudio real do James exige ambiente integrado e não é declarado validado aqui.

Referências examinadas: [missmanners](https://codepen.io/missmanners/pen/rwzBam) (filtros de período e organização em listas/seções), [Tbgse](https://codepen.io/Tbgse/pen/KzaKpm) (hierarquia responsiva e apresentação de métricas/gráfico). [icebob](https://codepen.io/icebob/pen/gbLXQy) retornou inacessível em duas tentativas. A [política de licenças do CodePen](https://blog.codepen.io/documentation/licensing/) foi consultada: Pens públicos são MIT. Nenhum código, número demonstrativo, recurso gráfico ou dependência dessas referências foi copiado.

Arquivos principais: `lib/parts-consumption.ts` e seu espelho gerado no backend; rota Express; `app/api/parts-consumption/route.ts`; `lib/parts-export.ts`; tela/CSS de peças; variante de `InsightChart`; `parts-timeline.tsx` e `parts-planning.tsx`; `workspace.tsx` (reinicia filtros quando a URL muda); serviços James; export público do tradutor SQL para testes; scripts/config/testes citados. ESLint ignora também diretórios `.next-*` gerados para build/validação.

Checks executados: reconciliação persistida e rota JWT passaram; 40 testes do backend e 4 cenários Playwright passaram; ESLint sem erros/avisos, TypeScript e build de produção (54 páginas) passaram. A inspeção usa a aplicação isolada descrita acima, não uma sessão no banco de produção.

## Compatibilidade da API

O relatório inclui `schemaVersion`, definido no contrato compartilhado `lib/parts-consumption-contract.ts` e gerado também para o backend. A tela, os registros de origem, a rota Next (inclusive PDF/XLSX) e o James verificam a versão e os campos estruturais obrigatórios antes de usar a resposta. Uma API antiga ou sem `quality` produz erro recuperável, sem substituir dados ausentes por zero. O teste de regressão remove `quality` nas duas telas e na investigação, confirma ausência de erros de renderização e testa recuperação. O teste da rota Next confirma 503 para respostas incompatíveis, impede exportá-las e preserva o 401 sem sessão.

`npm run dev` inicia a API com o `nodemon` já instalado no backend, observando `server.js`, `src` e o adaptador `lib/neon-db.mjs`, com debounce de 750 ms. O `node --watch` usado inicialmente apresentou `EADDRINUSE` em reinícios neste Windows e foi substituído. Produção continua sem watcher. Após alterar os serviços TypeScript compartilhados, gere os módulos com `npm run sync:workspace`. Uma instância iniciada pelo launcher anterior precisa ser reiniciada uma vez para ativar esse comportamento.

No Windows, o encerramento pelo launcher termina também os processos filhos de cada servidor, para liberar suas portas. A correção foi verificada com três reinícios reais por mudanças apenas nos timestamps dos módulos: `/health` retornou 200 em todos e após estabilização; a rota de peças sem sessão continuou retornando 401. Os logs da sessão local registraram consultas das dashboards com status 200. Essa verificação de disponibilidade não substitui a reconciliação de dados no banco isolado.
