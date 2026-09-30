# MARCON — Sistema integrado de almoxarifado

Pasta única com **frontend** (Next.js) e **backend** (Express) integrados sobre um **banco MySQL unificado**. O objetivo e as funcionalidades originais dos dois projetos foram preservados.

## Arquitetura da integração

```
┌─────────────────────────┐        HTTP + JWT        ┌──────────────────────────┐
│  frontend/ (Next.js)    │  ──────────────────────▶ │  backend/ (Express)      │
│  UI, sessão (cookie),   │   /login, /login/rfid,   │  API REST + Swagger,     │
│  face, passkeys, James, │   /api/workspace/*       │  regras de negócio,      │
│  mapas, OCR             │ ◀──────────────────────  │  estoque, requisições    │
└──────────┬──────────────┘                          └────────────┬─────────────┘
           │ credenciais (face/passkey/sessão)                    │ dados de negócio
           ▼                                                      ▼
        ┌───────────────────────────────────────────────────────────────┐
        │              MySQL — banco unificado `marcon`                  │
        └───────────────────────────────────────────────────────────────┘
```

- **Banco unificado**: um único schema (`marcon`) atende os dois lados. A migração do backend aplica o schema completo do aplicativo (001–005) mais a migração de integração (006: RFID, tokens de senha, overrides de permissão).
- **Backend é o dono das regras de negócio**: catálogo, estoque, requisições, transferências, devoluções, dashboards e equipe passam pela API Express (`/api/workspace/*` e as rotas REST clássicas). O frontend consome essa API com o JWT emitido no login.
- **Frontend mantém** login por senha/RFID/facial/passkey, assistente James (IA), mapas e rotas, OCR e exportações — a camada visual e de credenciais biométricas. Somente leitura/escrita de credenciais e sessão continuam locais; todo o resto flui pelo backend.
- **RFID integrado**: o acesso por crachá da tela de login, que era apenas simulado, agora é validado de verdade pelo backend (`POST /login/rfid`).

## Pré-requisitos

- Node.js 18+ (recomendado 20+)
- MySQL 8+ ou MariaDB 10.5+ acessível (padrão: `localhost:3306`)

## Subida rápida

```bash
# 1) Cria backend/.env e frontend/.env.local a partir dos exemplos e instala dependências
npm run setup

# 2) Ajuste credenciais do MySQL nos dois arquivos de ambiente:
#    - backend/.env        (DB_*, JWT_SECRET)
#    - frontend/.env.local (DB_*, SESSION_SECRET — mínimo 32 caracteres)

# 3) Cria o banco, tabelas e dados de exemplo (SEED_PASSWORD já vem nos exemplos)
npm run migrate
npm run seed

# 4) Sobe os dois juntos (backend em :3001, frontend em :3000)
npm run dev
```

Acesse **http://localhost:3000**. Documentação da API: **http://localhost:3001/api-docs**.

> Windows sem bash: rode `npm run dev:backend` e `npm run dev:frontend` em dois terminais.

## Produção

```bash
npm run build   # build do frontend
npm start       # backend + frontend otimizado
```

## Contas de exemplo (seed)

| Matrícula | E-mail | Papel | Senha |
|-----------|--------|-------|-------|
| 1001 | ana@marcon.demo | Funcionária | `SEED_PASSWORD` |
| 1002 | carlos@marcon.demo | Líder de bloco | `SEED_PASSWORD` |
| 1003 | mariana@marcon.demo | Almoxarife | `SEED_PASSWORD` |
| 1004 | rafael@marcon.demo | Administrador | `SEED_PASSWORD` |

Crachás RFID do seed: admin = `ADMIN_RFID` (padrão `AABBCCDDEE`), funcionária = `EMPLOYEE_RFID` (padrão `0A1B2C3D4E`, usado pelo botão de acesso simulado via `RFID_DEMO_TAG`).

## Scripts na raiz

| Comando | Ação |
|---------|------|
| `npm run setup` | Cria arquivos de ambiente e instala dependências dos dois pacotes |
| `npm run migrate` | Cria/atualiza o banco unificado (idempotente) |
| `npm run seed` | Insere dados de exemplo |
| `npm run dev` | Sobe backend (:3001) e frontend (:3000) juntos |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm test` | Testes unitários do backend (Jest) |

## O que mudou na integração

**Backend (`backend/`)**
- Passou a operar sobre o schema unificado do aplicativo (tabelas `parts`, `inventory`, `requests`, `users` com papéis `admin`/`lider`/`almoxarifado`/`funcionario`).
- Senhas em scrypt (mesmo formato do frontend); JWT emitido em `/login` e `/login/rfid`.
- Nova camada de workspace (`src/workspace/`) com as regras de negócio completas: snapshot, ações (`createRequests`, `changeRequestStatus`, `transfer`, `savePart`, `saveUser`, devoluções, recebimentos etc.) e transferências — hoje consumida pelo frontend e disponível a qualquer cliente REST.
- Rotas REST clássicas mantidas (`/api/products`, `/api/stock`, `/api/requests`, dashboards, RFID, usuários) e adaptadas ao banco unificado; ciclo de vida da requisição segue o do aplicativo: Pendente → Em análise → Aprovada (reserva automática) → Entregue (QR) → recebimento confirmado.
- Setores passaram a ser atributo textual do usuário (`users.sector`): `GET /api/sectors` lista os setores existentes; criação/edição acontece no cadastro de usuários.

**Frontend (`frontend/`)**
- Nova camada cliente da API (`lib/backend-client.ts`); login e login RFID validam credenciais no backend e guardam o JWT em cookie httpOnly (`marcon_api_token`) além da sessão local.
- `lib/workspace-db.ts` e `lib/workspace-actions.ts` viraram clientes HTTP da API — toda a UI (catálogo, estoque, requisições, dashboards, James) passa pelo backend sem mudança visual.
- Modo demonstração (sem banco) continua funcionando exatamente como antes, sem backend.
- Variáveis novas no `.env.local`: `BACKEND_URL` (obrigatória no modo MySQL) e `RFID_DEMO_TAG`.

## Observações

- Os papéis seguem a regra do aplicativo: funcionário requisita, líder analisa/aprova, almoxarife entrega/gerencia estoque, admin gerencia tudo. A API REST aplica as mesmas regras.
- Sem banco configurado, o frontend sobe em modo demonstração (dados em memória), sem precisar do backend.
- O backend sozinho continua sendo uma API REST completa e documentada (Swagger em `/api-docs`).
