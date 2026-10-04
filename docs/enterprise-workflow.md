# Fluxo integrado de materiais

As operações usam o PostgreSQL configurado no `.env` da raiz. Login por senha e RFID exigem o banco e o backend; não existe acesso automático com contas de demonstração. Um envio que falha não cria saldo local fictício. A interface atualiza os dados após cada operação, ao receber foco e a cada 10 segundos.

## Requisições

1. O funcionário escolhe peça ou caixa. A conversão usa o tamanho de embalagem cadastrado e mantém a quantidade solicitada e a embalagem daquele pedido.
2. O líder acompanha **Solicitações do bloco**, inicia a análise e aprova ou rejeita. A aprovação reserva saldo sem movimentar estoque. A rejeição preserva seu motivo e altera o status para **Rejeitada**.
3. O almoxarife acompanha a fila **Requisições para atendimento**, com os pedidos aprovados, em separação, em entrega e com cancelamento solicitado. **Pegar para entrega** atribui o responsável e muda para **Em separação**. Duas pessoas não podem assumir o mesmo pedido.
4. O responsável confere o QR e a quantidade total reservada. **Confirmar retirada** prepara uma confirmação válida por cinco minutos, sem baixa. **Confirmar novamente e baixar estoque** valida os mesmos dados, desconta o estoque em transação e muda para **Em entrega**. Alterar código ou quantidade exige nova confirmação.
5. **Confirmar entrega** muda para **Entregue**, grava a data e encerra o atendimento. Não desconta novamente. O pedido sai da fila e entra no histórico dos perfis autorizados.

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

## Validação

`npm run test:api`, `npm run lint`, `npx tsc --noEmit`, `npm run check:workspace` e `npm run build` verificam o código. `npm run test:login-routes` verifica login e rotas com frontend e backend em execução.

`playwright.workflow.config.ts` exige um banco descartável cujo nome termine em `_test`, com migrações e contas de teste previamente preparadas. Execute frontend na porta 3101 e backend na 3106, apontando ambos para esse mesmo banco. A suíte `tests/neon/enterprise-workflow.spec.ts` percorre o fluxo entre os quatro perfis, valida saldos, caixas, rejeição, QR inválido, responsabilidade, dupla confirmação, devolução, reposição, histórico, painel de materiais, botões da interface e responsividade. Não execute o seed nem essa suíte no banco da empresa.

Em ambientes de teste com pouco disco, `MARCON_DISABLE_BUILD_CACHE=1` desativa o cache persistente do compilador sem alterar as regras de negócio.
