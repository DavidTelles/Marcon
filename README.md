# MARCON

Aplicação Next.js e API Express na mesma estrutura de projeto. A interface está em `app/`, os módulos compartilhados em `lib/` e a API Express em `api/`. Ambas usam o mesmo MySQL. O comando principal inicia os dois serviços.

## Preparação

Requer Node.js e MySQL. Execute na raiz:

```bash
npm run setup
```

Revise as credenciais em `.env.local` (interface) e `api/.env` (API). Se `.env` já existir na raiz, ele também é usado pelo Next.js. A API precisa de `JWT_SECRET`; a interface precisa de `SESSION_SECRET` para sessões estáveis.

```bash
npm run migrate
npm run seed
npm run dev
```

Acesse http://localhost:3000. A API fica em http://localhost:3001 e o Swagger em http://localhost:3001/api-docs.

## Comandos

- `npm run dev`: inicia Next.js e Express juntos.
- `npm run dev:next`: inicia só o Next.js.
- `npm run dev:api`: inicia só o Express.
- `npm run build` e `npm start`: build e execução.
- `npm run test:api`: testes da API.

A instalação também pode ser feita separadamente com `npm ci` e `npm ci --prefix api`. O reconhecimento facial requer Python e os pacotes listados em `face/requirements.txt`. Consulte [APP.md](APP.md) para detalhes da interface.
