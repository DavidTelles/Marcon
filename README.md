# MARCON

Aplicação Next.js e API Express na mesma estrutura de projeto. A interface está em `app/`, os módulos compartilhados em `lib/` e a API Express em `backend/`. Ambos usam o mesmo banco Neon via Drizzle. O comando principal inicia os dois serviços.

## Preparação

Requer Node.js e uma URL PostgreSQL do Neon. Execute na raiz:

```bash
npm run setup
```

Configure apenas o `.env` da raiz: frontend, API Express, seed e migrações usam esse mesmo arquivo e, portanto, o mesmo banco. `app/api` contém os Route Handlers do Next.js; `backend/` contém o Express iniciado junto com o frontend.

O setup gera `SESSION_SECRET` e `JWT_SECRET` aleatórios quando ausentes ou preenchidos com os exemplos, preservando segredos válidos. Para reparar um `.env` existente, execute `node scripts/setup-env.mjs`. O login com Neon exige o Express em execução; use `npm run dev` para iniciar os dois serviços.

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
- `npm run test:logistics`: integração dos fluxos operacionais em schema temporário do PostgreSQL real.
- `npm run test:logistics:ui`: inclui navegador, sessão, vínculos, exportações e publicação; execute `npm run build` antes.
- `npm run test:login-routes`: verifica login dos quatro perfis, cookies, logout e rotas com os serviços em execução; requer `TEST_PASSWORD` ou `SEED_PASSWORD` das contas de teste.

A instalação também pode ser feita separadamente com `npm ci` e `npm ci --prefix backend`. O reconhecimento facial requer Python e os pacotes listados em `face/requirements.txt`. Consulte [APP.md](APP.md) para detalhes da interface.

Os fluxos de solicitações, retirada, entrega, materiais do bloco, reposição e planta estão descritos em [Fluxo integrado de materiais](docs/enterprise-workflow.md). O acesso operacional exige o banco e o backend, sem login automático de demonstração.

O assistente Marco usa Ollama local, com comandos validados, voz e ponte autenticada para acesso pela Vercel. Consulte [configuração e cobertura](docs/marco-ollama.md) e [testes e medições](docs/marco-tests.md). Comece por `npm run marco:doctor`.
