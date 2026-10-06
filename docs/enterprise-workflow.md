# Fluxo integrado de materiais

As operações usam o PostgreSQL configurado no `.env` da raiz. Login por senha e RFID exigem o banco e o backend; não existe acesso automático com contas de demonstração. Um envio que falha não cria saldo local fictício. A interface atualiza os dados após cada operação, ao receber foco e a cada 10 segundos.

## Requisições

1. O funcionário escolhe peça ou caixa. A conversão usa o tamanho de embalagem cadastrado e mantém a quantidade solicitada e a embalagem daquele pedido.
2. O líder acompanha **Solicitações do bloco**, inicia a análise e aprova ou rejeita. A aprovação reserva saldo sem movimentar estoque. A rejeição preserva seu motivo e altera o status para **Rejeitada**.
3. O almoxarife acompanha a fila **Requisições para atendimento**, com os pedidos aprovados, em separação, em entrega e com cancelamento solicitado. **Pegar para entrega** atribui o responsável e muda para **Em separação**. Duas pessoas não podem assumir o mesmo pedido.
4. O responsável confere o QR e a quantidade total reservada. **Confirmar retirada** prepara uma confirmação válida por cinco minutos, sem baixa. **Confirmar novamente e baixar estoque** valida os mesmos dados, desconta o estoque em transação e muda para **Em entrega**. Alterar código ou quantidade exige nova confirmação.
5. **Confirmar entrega** muda para **Entregue**, grava a data e encerra o atendimento. Não desconta novamente. O pedido sai da fila e entra no **Histórico geral de entregas**, consultável por todos os perfis, com filtros de bloco e almoxarifado. Pedidos pendentes continuam respeitando o escopo de cada perfil. A fila de solicitações destaca e organiza Urgente, Moderado e Leve, nessa ordem.

Retirada parcial não encerra o pedido: a quantidade conferida deve corresponder à reserva completa. As chaves de envio impedem duplicar a baixa se a resposta de uma operação já persistida precisar ser consultada novamente.

## Pedidos fora do padrão

A avaliação ocorre no servidor usando os pedidos aprovados dos últimos 90 dias, separadamente por bloco e setor. Com pelo menos cinco pedidos no contexto, um material sem histórico é incomum. Com pelo menos três amostras do material, uma quantidade acima do maior valor entre duas vezes a mediana e a mediana mais três desvios absolutos medianos é incomum; o desvio mínimo é uma peça.

Pedidos incomuns e urgentes exigem justificativa com pelo menos três caracteres. O motivo da detecção e a justificativa ficam visíveis para o líder. Sem histórico suficiente, a tela informa essa condição; não usa um limite genérico de dez peças.

## Materiais e reposição

O painel **Materiais** do líder mostra entregas concluídas como entradas e devoluções conferidas como saídas, por material, período e bloco. O saldo registrado acumulado corresponde às entregas menos devoluções; não estima consumo interno que não tenha sido registrado. Materiais desativados continuam aparecendo quando têm histórico de movimentação.

**Reposição de estoque** recebe diretamente no almoxarifado selecionado, exige QR, quantidade e justificativa, respeita capacidade e não exige almoxarifado de origem.

## Planta baixa

A reserva prioriza a menor distância transitável até o ponto de entrega na planta publicada e revisada. O estoque pode vincular uma posição específica ao mapa. O percurso e a versão utilizada são registrados para auditoria.

Para ativar recomendações reais, um administrador precisa validar a planta física, ligar os pontos de retirada aos almoxarifados e os pontos de entrega aos blocos, conferir acessos, bloqueios e escala e publicar a versão. Sem essa informação validada, o sistema informa a indisponibilidade do percurso e permite atendimento manual; não inventa distância.

O editor lista os almoxarifados, blocos e setores cadastrados e a quantidade de funcionários vinculados a cada setor. Selecione um local nessa lista e clique na planta para posicioná-lo. Almoxarifados menores têm cadastro, saldo e vínculo próprios e podem compartilhar o mesmo bloco. Funcionários usam o destino do seu local de trabalho, quando configurado, ou do setor oficial. Cadastros antigos sem setor oficial podem usar o destino geral do bloco. Um setor oficial sem ponto compatível é informado como pendente; não é substituído por outro setor.

Em **Funcionários** ou **Planta e rotas**, abra **Integração de funcionários, estoques e planta**. Cadastre as filiais e setores oficiais, vincule blocos e almoxarifados à filial e associe os funcionários ao setor ou local de trabalho. Após revisar e publicar a planta, vincule os locais de trabalho aos pontos de entrega e cada combinação peça/almoxarifado ao ponto de estoque correspondente. As opções são filtradas pelo cadastro e o servidor rejeita vínculos incompatíveis. **Verificar integração** consulta o banco e verifica planta, escala, filiais, pontos transitáveis e caminhos até os funcionários. O cadastro não fornece coordenadas físicas automaticamente. As sugestões de OCR associam apenas nomes exatos e únicos aos cadastros e continuam exigindo revisão.

Uma requisição guarda os IDs oficiais e o ponto de entrega na sua criação. Alterar depois a lotação do funcionário ou o ponto do local de trabalho não muda o destino do pedido existente. A publicação de uma planta protege os pontos de estoque vinculados e os destinos de pedidos ainda em atendimento. Editar um funcionário preserva sua lotação oficial e rejeita bloco ou setor contraditórios.

**Sincronizar vínculos confirmados** associa funcionários sem vínculo a setores oficiais com nome exato e único no mesmo bloco e filial. Também preenche as posições de estoque ainda sem ponto quando há um único ponto transitável do almoxarifado na planta publicada. Os vínculos existentes são preservados e ambiguidades continuam pendentes. Publicar uma planta revisada faz essa associação de estoque automaticamente, com auditoria, quando o administrador tem permissão de estoque. As posições representam pontos de coleta do almoxarifado; não inferem coordenadas de prateleiras a partir do código da peça.

Para estruturar cadastros antigos, `npm run links:preview` mostra as pendências sem gravar. `node scripts/link-existing-records.mjs --apply --branch-code CODIGO --branch-name NOME --actor MATRICULA_ADMIN` atribui os cadastros à unidade selecionada, cria setores com os nomes e blocos já registrados e locais lógicos por setor, vincula os usuários e completa os IDs das requisições usando o contexto histórico capturado. Uma unidade lógica inicial não determina o endereço ou as coordenadas da planta. Os locais criados não têm ponto físico; este é configurado depois na planta revisada. O comando exige administrador com permissões de pessoas e estoque, gera cópia dos vínculos anteriores em `.validation/integrated-logistics/`, grava em uma transação auditada e é idempotente. Vínculos incompatíveis ou setores ambíguos interrompem a operação e revertem as alterações. O comando não altera quantidades, reservas ou pontos de entrega históricos. Não use para unir cadastros de unidades diferentes.

As recomendações de distribuição alocam a demanda histórica aos almoxarifados alcançáveis por Dijkstra, respeitando capacidade. Consideram reservas, transferências pendentes e recebimentos confirmados. Quando o saldo da rede não cobre todas as metas ideais, dividem a cobertura proporcionalmente à demanda e preservam os mínimos e a cobertura de segurança das origens. Locais desconectados ou consumo sem destino mapeado não geram redistribuição automática. A recomendação precisa ser solicitada e executada pelo fluxo de transferência; consultar o relatório não altera saldo.

As propostas ficam em `stock_recommendations`, com origem, destino, peça, quantidade, evidências e versão da planta. Aceitar uma proposta valida novamente saldo, reservas, capacidade, rota, validade de 15 minutos e atualização da peça. O servidor usa a proposta armazenada e rejeita quantidades ou IDs adulterados. Aceite, rejeição e transferência são persistidos e auditados. O despacho e o recebimento conferem QR e quantidade; repetir o recebimento não duplica saldo.

## Painéis de peças

Administração e almoxarifado dispõem de **Consumos**, com consumo e comparação entre períodos, e **Peça**, com participação percentual de blocos e setores. Os filtros incluem período, material, bloco, setor, funcionário e almoxarifado de retirada do pedido. Os dois painéis têm navegação independente e exportam os resultados filtrados em planilha XLSX e PDF, pelo mesmo backend que atende a consulta.

O consumo registrado considera somente pedidos entregues, pela data da entrega, descontando devoluções aptas já conferidas vinculadas a esses pedidos. Uma devolução posterior pode atualizar o consumo histórico do período de entrega. O filtro de almoxarifado seleciona pedidos retirados daquele local; quando um pedido envolve mais de uma origem, a quantidade corresponde ao pedido completo. As quantidades são apresentadas com suas unidades, sem somar unidades incompatíveis em um indicador geral. Os painéis consultam o mesmo backend e banco das operações e não usam dados ilustrativos.

## Validação

`npm run test:api`, `npm run lint`, `npx tsc --noEmit`, `npm run check:workspace` e `npm run build` verificam o código. `npm run test:login-routes` verifica login e rotas com frontend e backend em execução.

`npm run test:logistics` testa os serviços de produção e as rotas HTTP em PostgreSQL real. Cria um schema temporário exclusivo no banco configurado, aplica as migrações nesse schema, grava os dados de teste e remove somente esse schema ao terminar. Requer permissão de criar schemas e conexão direta ao Neon. Não altera as linhas da aplicação no schema `public`. Testa permissões, vínculos, Dijkstra, reserva, destino preservado, QR, retirada, entrega, recebimento, recomendações persistidas, transferências e conservação dos saldos. Os registros são verificados novamente depois de fechar e reabrir a conexão.

Após `npm run build`, `npm run test:logistics:ui` também inicia frontend e backend próprios em portas livres e verifica sessão assinada, formulário de vínculos, dashboard, XLSX/PDF e publicação da planta no navegador. Usa Edge por padrão; `PLAYWRIGHT_CHANNEL` pode selecionar outro navegador instalado. Evidências ficam em `.validation/integrated-logistics/`. Os processos normais da aplicação continuam em execução.

`playwright.workflow.config.ts` exige um banco descartável cujo nome termine em `_test`, com migrações e contas de teste previamente preparadas. Execute frontend na porta 3101 e backend na 3106, apontando ambos para esse mesmo banco. A suíte `tests/neon/enterprise-workflow.spec.ts` percorre o fluxo entre os quatro perfis, valida saldos, caixas, rejeição, QR inválido, responsabilidade, dupla confirmação, devolução, reposição, histórico, painel de materiais, botões da interface e responsividade. Não execute o seed nem essa suíte no banco da empresa.

Em ambientes de teste com pouco disco, `MARCON_DISABLE_BUILD_CACHE=1` desativa o cache persistente do compilador sem alterar as regras de negócio.
