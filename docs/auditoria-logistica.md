# Auditoria de integração e logística — 03/10/2026

Alterações restritas à comunicação, permissões, estoque, planta, rotas, recomendações e seus testes. As alterações preexistentes em `employee-request-screen.tsx`, `workspace.tsx` e `package-lock.json` foram preservadas. Nenhuma migração, seed ou movimentação foi executada em banco neste ambiente.

## Arquitetura e decisões

- Next autentica a sessão, valida origem das escritas e encaminha as ações ao Express. Express autentica JWT, recarrega usuário ativo/permissões e executa a transação no PostgreSQL/Neon. Mapas, relatórios e perfil já acessavam o mesmo banco pelo adaptador existente.
- Os adaptadores REST de materiais/estoque agora chamam o fluxo oficial de workspace. Não há segundo mecanismo de movimentação. As cópias de serviços de domínio em Express são geradas dos arquivos `lib/`; `npm run check:workspace` detecta divergência. `workspace-actions.js`, snapshot e adaptador de banco continuam específicos do backend.
- James libera os locks da revisão antes de chamar a transação Express; confirmações mantêm chave persistente e recuperação de resposta já gravada. Essa correção exige teste integrado para comprovar ausência de bloqueio no banco real.
- Negação individual prevalece sobre papel. O cadastro REST de usuários exige administrador autorizado; JWT deixou de usar segredo fixo. O token de recuperação de senha deixou de ser exposto na resposta HTTP. Não existe provedor de envio de recuperação configurado.
- Quantidade solicitada vem da requisição; aprovação integral registra/reserva a mesma quantidade; entregue vem da soma dos eventos `saida` vinculados. O fluxo existente exige atendimento integral, com QR e quantidade conferida, e não implementa entrega parcial.
- Disponível = físico − reservas de requisições − transferências solicitadas ainda sem saída. Solicitação compromete disponibilidade; despacho baixa origem e registra trânsito; recebimento credita destino. Total da empresa deve contar físico **mais trânsito**, separado por unidade. Transferência, ajuste e pedido não são consumo.
- Entrada, devolução pendente, entrada futura e criação de carrinho exigem `requestKey`. Escritas aditivas reutilizam `request_submissions` na mesma transação. Etapas encerradas rejeitam repetição; transferências repetidas têm resposta 409. Clientes devem conservar a chave ao repetir a mesma tentativa.
- Cadastro preserva metadados omitidos, capacidade, posição e quantidade em edição REST. Troca de unidade com estoque/documentos é recusada; não há conversão arbitrária. Locais/blocos e categorias da interface vêm do cadastro real; dados demonstrativos não são carregados provisoriamente no modo persistente.
- Ação confirmada com falha posterior de atualização informa que foi registrada e pede atualização dos dados. Eventos de alteração atualizam consultas e filas. Erros de catálogo/estoque preservam códigos HTTP e resposta JSON.

## Inventário de abas e contratos

| Tela/aba e perfil | Ações e fluxo de dados inspecionado | Verificação real neste ambiente |
|---|---|---|
| Login, saída, perfil; quatro perfis | `/api/login`, `/api/logout`, GET/PATCH `/api/profile`; sessão, JWT, conta ativa, escopo e senha | Navegação e sessão de demonstração passaram; persistência de perfil não testada |
| Catálogo e nova requisição; funcionário | GET `/api/items`, `/api/items/[id]`; POST `/api/requisicoes` ou `/api/workspace` `createRequests`; quantidade, justificativa, chave, `requests` e `request_submissions` | Código auditado; ciclo persistente não testado |
| Solicitações, requisições e histórico; líder, almoxarife, administrador | Snapshot, edição/cancelamento próprios, análise/aprovação por escopo, reservas, atendimento com QR, `stock_movements`, confirmação de recebimento e auditoria | Código auditado; ciclo e concorrência em banco não testados |
| Estoque; almoxarife | Material/local, entrada, ajuste, entrada prevista, recebimento, cancelamento e transferência; `parts`, `inventory`, documentos e auditoria | Código corrigido; persistência não testada |
| Devoluções; almoxarife | Registro vinculado à entrega, teto devolvível, condição, inspeção única; estoque somente após conferência apta | Código corrigido; persistência não testada |
| Funcionários, cadastro/edição; administrador | `saveUser`, `toggleUser`, perfil; duplicidade, bloco, papel, conta ativa, senha e auditoria | Código/contratos inspecionados; gravação não testada |
| Dashboard geral, bloco, setor, material, estoque e histórico; escopos por perfil | GET `/api/operations`, filtros, paginação, detalhamento, gráficos por unidade e exportações; solicitações distintas de baixas | Código corrigido; consultas, exportações e atualização real não testadas |
| Compra e recomendação; administrador/almoxarife | Mesmo serviço de relatórios; compra preserva método existente; distribuição por cobertura; revisão, aceite/rejeição, fila oficial e auditoria | Fórmula e limites passaram nos testes unitários; integração persistente não testada |
| Planta e rotas; administrador edita, administrador/almoxarife consultam | GET/POST `/api/maps`, imagem, rascunho/publicação, vínculos, testes de caminhos e histórico de entrega | Editor e resposta 503 real passaram; publicação/consulta do banco não testadas |
| James; quatro perfis | `/api/james/chat`, `/api/james/voice`; consulta de serviços existentes, confirmação, permissão e chave | Linguagem/contratos unitários passaram; operações persistentes/voz local não testadas |

Os endpoints REST de setores, blocos, almoxarifados, RFID, recuperação de conta e biometria foram identificados na arquitetura. Não foi feita validação integral dessas integrações externas nem de todos os contratos administrativos REST; a tabela não declara cobertura completa de persistência.

## Rotas

Tipos industriais incluem armazenamento local, produção, acessos, coleta/reposição, recebimento/expedição/carga, administração, circulação vertical, apoio e ponto personalizado. Restrição/bloqueio/transporte são propriedades separadas do tipo. IDs são estáveis; estoques vinculam registros existentes.

Dijkstra calcula custo mínimo no grafo cadastrado, com sentido único, pesos não negativos, bloqueios, restrições de transporte e ligações verticais explícitas entre andares. Distância usa metros somente com escala calibrada; sem escala, unidades do mapa. Comprimentos explícitos conservam sua unidade durante calibração. Tempo usa somente segundos cadastrados; trechos sem duração ficam indisponíveis nesse objetivo. Não há velocidade/minutos inventados nem linha direta de fallback.

Paradas usam Dijkstra entre pares e ordenação aproximada por vizinho mais próximo/2-opt, com coleta antes de entrega e destino final preservado. Não há promessa de ordem global ótima. O editor valida cada segmento do percurso exibido.

Entrega parte das reservas/local real e termina no vínculo do bloco. Transferências partem/terminam nos locais reais e revalidam a planta em cada etapa. Entrada futura permite selecionar o ponto físico de recebimento/carga para encaminhar ao estoque vinculado. Reposição entre estoques usa transferência oficial; entrega ao consumo usa requisição/atendimento. Sem vínculo/caminho, informa mapeamento faltante; operação física manual continua exigindo conferência.

Rotas registradas conservam versão, parâmetros, custo e nós no histórico de entrega ou auditoria de transferência/recebimento. Publicação invalida rotas visíveis; consultas também verificam mudança a cada 30 s/foco. Despacho e atendimento recalculam no servidor. Mudanças em rascunho não alteram a versão operacional. Publicação recusa referências de estoque/pontos inválidas.

## Fórmula das recomendações

1. Consumo = eventos efetivos `saida`, descontadas devoluções aptas vinculadas à mesma requisição/material dentro do período selecionado; resultado limitado a zero. Retorno sem baixa correspondente nesse intervalo não cria consumo negativo.
2. Cada demanda de bloco é atribuída uma única vez a locais acessíveis, em ordem de custo na planta, compartilhando o excedente de demanda quando a capacidade cadastrada por material limita o local mais próximo. Filtros de apresentação não retiram a necessidade dos outros setores da cobertura da origem.
3. `média = consumo líquido / dias observáveis`; `mínimo = max(mínimo cadastrado, teto(média × prazo × (1+margem)))`; `alvo = max(mínimo cadastrado, teto(média × (prazo+horizonte) × (1+margem)))`, limitado pela capacidade livre das reservas quando conhecida.
4. Transferível = `max(0, disponível − max(alvo, mínimo))`. Necessidade do destino desconta disponibilidade, entradas confirmadas previstas dentro do prazo e transferências em andamento. Quantidade atende simultaneamente excedente, déficit, capacidade física restante e múltiplos oficiais; cada excedente é debitado uma só vez durante a geração.
5. Prioridade lexicográfica: risco de falta; déficit/alvo normalizado; desempate determinístico. Origens do mesmo material/unidade são ordenadas pelo custo da rota. Não há soma ponderada de metros, unidades e minutos.

O fluxo atual aceita unidades-base inteiras e usa `packSize` oficial para caixas; não permite conversão entre unidades distintas. Capacidade é por material/local, não volume total do almoxarifado. Capacidade ausente é sinalizada e precisa de conferência antes do aceite. Histórico curto, consumo nulo ou irregular explicita incerteza. Demanda sem mapeamento impede retirar suposto excedente dos locais cuja necessidade não pode ser comprovada.

Exemplo controlado de pregos: origem com 20 caixas, consumo de 6 em 30 dias; destino com 1 caixa, consumo de 24 em 30 dias; prazo 2 dias, horizonte 8, margem 25%, mínimos 2/1. Alvos 3/10; rota 5 m; sugestão **9 caixas**, deixando 11 na origem e 10 no destino. Resultado unitário verificado; não corresponde a saldos reais desta empresa.

Aceite reconsulta a recomendação, exige quantidade/locais atuais e abre solicitação oficial; backend revalida saldo, reservas, capacidade, cobertura e percurso. Rejeição e aceite são auditados, chave identifica proposta e compromissos ativos evitam repetir necessidade. Projeções de cobertura consideram as sugestões anteriores do relatório; nenhum saldo é movimentado automaticamente.

## Evidências e limites de conclusão

| Verificação | Classificação | Evidência |
|---|---|---|
| Tipos e build Next | passou | `npx tsc --noEmit`; `npm run build` |
| Lint | passou | `npm run lint`, sem erros/avisos; configuração distingue Express CommonJS de TS |
| Domínio e serviços sincronizados | passou | `npm run check:workspace` |
| Dijkstra, consumo, embalagem, capacidade, reservas, unidades e disputa de excedente | passou | 24 testes em `playwright.unit.config.ts`; inclui 13 testes de logística e exemplo de pregos |
| Contratos de API, senha, JWT e autorização | passou | 26 testes Jest; HTTP real sem sessão recusado em cadastro, workspace e entrada; demais testes incluem doubles e não provam persistência |
| Navegação dos quatro perfis, login/saída e editor responsivo | passou | 16 testes Edge/Playwright; percurso sintético, bloqueio sem fallback, resposta real 503; capturas 1440/768/375 px inspecionadas. Rodada final exclui explicitamente o cenário antigo de inclinação 3D abaixo |
| Teste antigo de inclinação 3D do login | falhou | Espera `--pointer-x`; cena atual estática não tem esse comportamento. Sem relação com os caminhos/estoque; teste completo de login não foi declarado integralmente aprovado |
| Voz Piper/whisper local | não testado | Teste explicitamente ignorado sem executáveis configurados |
| API → transação → banco; ciclo completo e concorrência | não testado | Ausência de DATABASE_URL/banco descartável; suites `tests/neon` preparadas, não executadas |
| Recomendações/rotas operacionais em dados cadastrados | não testado | Sem banco/mapa publicado acessível; inspeção visual usou imagem sintética |
| Validade física da planta e passagens | não testado | Nenhuma evidência física fornecida; algoritmo não confirma existência de passagem |

Configuração necessária: DATABASE_URL, SESSION_SECRET e JWT_SECRET aleatórias de pelo menos 32 caracteres, BACKEND_URL e backend em execução; migrações e cadastros oficiais; planta publicada/revisada; vínculos dos estoques, blocos e recebimentos; pesos/transportes, escala ou durações quando conhecidos; consumo efetivo, mínimos, prazo, embalagem e capacidades.

Para testes persistentes, configurar um banco descartável com nome terminado em `_test`, SEED_PASSWORD e segredos; executar migração/seed apenas nesse banco e `npx playwright test -c playwright.neon.config.ts`. Essa configuração inicia Next **e** Express. `ledger-idempotency.spec.ts` verifica gravação única por chave, reservas/baixa/devolução e conservação contando trânsito com HTTP e SQL reais. As suites existentes cobrem ciclos, permissões e rotas versionadas; podem exigir atualização de fixtures antigas ao usar um mapa já vinculado.

Pendências: executar e corrigir as suites de banco; validar visualmente a planta publicada da empresa e seus vínculos; validar os caminhos físicos com responsáveis; conferir capacidade desconhecida/compartilhada; integrar envio seguro de recuperação de conta. Sem essas evidências, a auditoria operacional completa permanece aberta.
