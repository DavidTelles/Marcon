# MARCON

Aplicação Next.js e serviços de backend na mesma estrutura de projeto. A interface está em `app/`, os módulos compartilhados em `lib/` e o backend em `backend/`. Ambos usam o mesmo banco Neon via Drizzle. Com `BACKEND_URL=embedded` (padrão), o Next executa os serviços do backend diretamente nas funções Node.js, inclusive na Vercel. O Express separado continua disponível.

## Preparação

Requer Node.js e uma URL PostgreSQL do Neon. Execute na raiz:

```bash
npm run setup
```

Configure apenas o `.env` da raiz: frontend, backend, seed e migrações usam esse mesmo arquivo e, portanto, o mesmo banco. `app/api` contém os Route Handlers do Next.js; `backend/` contém os serviços e a API Express opcional.

O setup gera `SESSION_SECRET` e `JWT_SECRET` aleatórios quando ausentes ou preenchidos com os exemplos, preservando segredos válidos. Para reparar um `.env` existente, execute `node scripts/setup-env.mjs`. Use `BACKEND_URL=embedded` para executar o backend no Next sem outro servidor.

```bash
npm run migrate
npm run seed
npm run dev
```

Acesse http://localhost:3000. Para usar o Express separado, configure `BACKEND_URL=http://localhost:3001`: `npm run dev` iniciará os dois serviços e o Swagger ficará em http://localhost:3001/api-docs.

## Hospedagem na Vercel

No projeto da Vercel, use **Root Directory = Marcon** se o repositório incluir essa pasta; se `package.json` estiver na raiz do repositório, mantenha a raiz. Framework: **Next.js**. O `vercel.json` define o build e os limites das funções. O deploy instala as dependências de runtime do backend pelo `package.json` da raiz, sem iniciar `backend/server.js`.

Em **Settings → Environment Variables**, configure para **Production** (e **Preview**, se usar):

| Variável | Valor |
| --- | --- |
| `BACKEND_URL` | `embedded` |
| `DATABASE_URL` | URL PostgreSQL real do Neon, a mesma usada pela aplicação local |
| `SESSION_SECRET` | Segredo aleatório de pelo menos 32 caracteres |
| `JWT_SECRET` | Outro segredo aleatório de pelo menos 32 caracteres |

Use os segredos válidos do `.env` local se quiser manter a configuração compartilhada. Não use os valores de exemplo. O `.env` local não é enviado ao deploy e nenhuma dessas variáveis deve ter o prefixo `NEXT_PUBLIC_`. Não defina `PORT=3001` no projeto Next da Vercel. `CORS_ORIGIN` não é necessário no modo integrado, pois o navegador acessa as rotas do próprio site.

Se o banco ainda não tiver as tabelas, execute `npm run migrate` localmente com a mesma `DATABASE_URL`. `npm run seed` é apenas para a carga inicial e exige `SEED_PASSWORD`; não execute seed automaticamente em cada deploy.

Depois de salvar as variáveis, faça **Redeploy** com este código. As alterações de variáveis só se aplicam a um novo deployment.

Validação sem revelar segredos:

```bash
npm run test:hosting
npm run check:hosting -- --database
npm run build
npm run test:logistics -- --ui --embedded
npm run check:hosting -- --url https://marcon-ten.vercel.app
```

`/health` deve retornar HTTP 200 com `status: "ok"`, `database: "connected"` e `backend: "connected"`. O endpoint verifica a conexão e as tabelas essenciais de login e estoque; confirme também login e operações com as contas dos perfis usados pela empresa. O diagnóstico local valida seu `.env`; somente a verificação com `--url` consulta a configuração publicada. O build da Vercel valida as variáveis essenciais e rejeita configuração ausente antes de publicar.

Para um backend hospedado separadamente, use `BACKEND_URL=https://seu-backend.example.com` (URL base sem `/api` ou `/login`) e o mesmo banco. Não aponte essa variável para o próprio frontend: isso chamaria suas páginas em vez da API Express. URLs locais e HTTP são rejeitadas na Vercel com uma mensagem de configuração.

O cadastro e o login facial hospedados chamam o serviço Python autenticado de `face/`, publicado como segundo projeto da Vercel. Configure `FACE_SERVICE_URL` e o mesmo `FACE_SERVICE_TOKEN` nos projetos conforme [configuração e validação facial](docs/facial-deployment.md). O login por senha funciona sem esse serviço. O assistente Marco requer a ponte HTTPS descrita em [docs/marco-ollama.md](docs/marco-ollama.md).

## Comandos

- `npm run dev`: inicia Next.js; também inicia Express quando `BACKEND_URL` aponta para o servidor local.
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
