# Catálogo demonstrativo Marcon

Na página inicial autenticada, use **Explorar catálogo**. A busca encontra itens por nome ou ID, sem diferenciar maiúsculas, minúsculas ou acentos. Categorias e o filtro de disponibilidade podem ser combinados.

Cada card exibe o saldo e abre `/catalogo/item/[id]`. O detalhe mostra descrição, especificação, localização e saldo. Funcionários podem iniciar uma requisição informando a quantidade, com validação do saldo no servidor. Itens sem saldo não podem ser requisitados. Outros perfis podem consultar o catálogo; a criação de requisições é restrita ao perfil Funcionário.

Os itens e saldos em `lib/catalog.ts` são dados de demonstração. Uma requisição gera protocolo e fica disponível em `GET /api/requisicoes` para o próprio usuário enquanto o processo do servidor estiver ativo. Esse registro é temporário, não reserva estoque nem envia o pedido ao almoxarifado. Para uso real, conectar catálogo, saldos e requisições a um backend com persistência e regras de negócio.

Validação: `npm run lint`, `npm run build` e `npm run test:e2e`. Os testes cobrem busca por nome e ID, filtros, saldo, detalhe, requisição, acesso por perfil, estados vazio e erro, recuperação e larguras de 320 a 1280 px.
