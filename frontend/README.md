# MARCON / Smartway

## Instalação e banco MySQL 8

No Workbench, abra `db/001_initial.sql` e execute o arquivo inteiro, sem selecionar
apenas um trecho. O script cria e seleciona `marcon` antes de criar as tabelas.
Atualize a lista **Schemas** ao terminar. Requer MySQL 8 e permissão para criar o banco.
Pelo terminal, `npm run db:migrate` cria o banco indicado em `DATABASE_URL` se necessário.

Na pasta `smartway`, execute `npm ci` (Node 20.9 ou superior).
Sem `DB_NAME`, `DB_USER` e `DATABASE_URL`, `npm run dev` inicia a demonstração em memória.

Para persistência, crie um banco MySQL 8 com charset `utf8mb4` e um usuário com
acesso a ele. Copie `.env.example` para `.env.local` e configure `DB_HOST`, `DB_PORT`,
`DB_NAME`, `DB_USER`, `DB_PASSWORD`,
`SESSION_SECRET` e `SEED_PASSWORD`. Nos campos separados a senha não precisa de
codificação de URL. Use aspas se houver `#` e escape `$` como `\$` no arquivo env.
`DATABASE_URL` continua disponível como alternativa; `DB_NAME` e `DB_USER` têm prioridade.
Nesta máquina, o serviço MySQL80 usa a porta `3307` no `my.ini`; defina
`DB_PORT=3307` no `.env.local`. O Workbench é apenas o cliente: a aplicação
se conecta ao MySQL Server com usuário e senha próprios.
Gere um segredo privado com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
A senha do seed deve ter pelo menos 12 caracteres.

Execute `npm run db:migrate`, `npm run db:seed` e `npm run dev`.
Remova `SEED_PASSWORD` do ambiente após o seed e reinicie a aplicação.
Nunca publique `.env.local`. `/health` verifica a conexão.
O seed usa `INSERT IGNORE`: não redefine senhas, saldos ou usuários existentes.
Faça backup antes de migrar bancos existentes: DDL MySQL não tem rollback integral.

| Matrícula | E-mail              | Perfil        | Bloco no seed MySQL |
| --------- | ------------------- | ------------- | ------------------- |
| 1001      | ana@marcon.demo     | Funcionário   | A                   |
| 1002      | carlos@marcon.demo  | Líder         | A                   |
| 1003      | mariana@marcon.demo | Almoxarifado  | —                   |
| 1004      | rafael@marcon.demo  | Administrador | —                   |

No MySQL, a senha inicial das quatro contas é `SEED_PASSWORD` (no ambiente local
de exemplo, `Marcon@12345`).
Na demonstração, a senha é `Marcon@123`. O demo mantém seus dados próprios.
Em bancos antigos, Carlos pode continuar no bloco B: ajuste pelo administrador
para aprovar pedidos de Ana. RFID é simulado apenas no modo demonstração.

## Verificação e pendências

Execute `npm run lint`, `npm run build` e, sem `DATABASE_URL`, `npm run test:e2e`.
Instale Chromium com `npx playwright install chromium` ou configure
`PLAYWRIGHT_CHANNEL=chrome` para usar o Chrome instalado.

Para integração, use um banco descartável cujo nome termine em `_test`, configure
`.env.local`, execute migração e seed e mantenha `SEED_PASSWORD` durante o teste.
Execute `npx playwright test --config=playwright.mysql.config.ts`.
O teste usa a porta 3101 e mantém os registros criados para inspeção.

As dependências foram recuperadas: lint e build passaram. Os testes de demonstração
cobrem os quatro logins fixos, retorno, logout e bloqueio de acesso entre perfis.
Para testar com outro servidor dev aberto, rode primeiro `npm run build` e defina
`PLAYWRIGHT_PRODUCTION=1`, `PLAYWRIGHT_PORT=3100` e `PLAYWRIGHT_CHANNEL=chrome`.
A configuração demo desativa `DB_NAME`, `DB_USER` e `DATABASE_URL` somente no processo de teste.
Os testes de integração exigem credenciais válidas para o MySQL configurado.

## Perfil e autenticação facial

`/profile` permite atualizar nome, e-mail e senha no MySQL. Toda alteração exige
a senha atual; cinco tentativas incorretas bloqueiam novas tentativas por 15
minutos. A troca de senha invalida as sessões anteriores. O administrador define
e confirma a senha inicial no cadastro de usuários.

Também estão disponíveis passkeys WebAuthn. Com MySQL configurado,
o usuário entra com senha, abre `/profile` e cadastra uma passkey integrada ao dispositivo.
Depois, pode informar e-mail ou matrícula e entrar com a passkey. O aparelho
pode solicitar rosto, digital ou PIN conforme o sistema, sem chave USB. Neste fluxo de passkeys, a aplicação não recebe
nem armazena imagens ou dados biométricos. O servidor verifica o desafio, a
assinatura e a credencial cadastrada antes de criar a sessão. Execute
`npm run db:migrate` para criar as tabelas de passkeys no banco existente.
WebAuthn requer HTTPS em produção (localhost funciona para desenvolvimento)
e um domínio estável: passkeys cadastradas em outro domínio não funcionam.

### Reconhecimento pela câmera, sem serviços externos

`npm ci` copia os modelos do Human 3.3.6 para `public/models/human` (também via
`npm run face:models`). Execute `npm run db:migrate`. Em localhost ou HTTPS,
entre com senha, abra `/profile`, confirme senha/consentimento e cadastre seis
amostras seguindo os movimentos e a pequena mudança de iluminação. No login,
informe matrícula/e-mail e escolha **Entrar com reconhecimento facial**.
O perfil permite excluir ou substituir o cadastro; senha e passkeys continuam disponíveis.

Somente embeddings faceres são persistidos, com AES-256-GCM e chave derivada de
`SESSION_SECRET` por HKDF. Proteja esse segredo e os backups do banco; sua troca
exige novo cadastro facial. Fotos, vídeos, landmarks, idade e gênero não são persistidos.
Os modelos carregam sob demanda; a câmera encerra ao cancelar, ocultar a aba ou sair.

Política em `lib/face-policy.ts`: similaridade Human ≥ **0,85** com pelo menos
3 das 6 referências, para **todas** as 5 capturas do login; consistência do
cadastro ≥ 0,80 entre cada par. Limiar inicial conservador, testado com fixtures
sintéticas, sem estimativa de FAR/FRR: calibre com pessoas e iluminação reais
antes de ampliar o uso. [Escala do Human](https://github.com/vladmandic/human/wiki/Embedding).
Há cinco tentativas por conta/modalidade a cada 15 minutos e desafios descartáveis de 120 s.
A sessão depende da comparação no servidor, nunca de `recognized: true`.
Presença por movimentos aleatórios é uma checagem simples: embeddings e medições
vêm do navegador, portanto cliente adulterado, vetores roubados, câmeras virtuais
e deepfakes podem burlá-la. Não equivale à proteção de uma passkey de hardware.

Testes: `npx playwright test tests/face-policy.spec.ts tests/face-model.spec.ts`;
com o banco de teste configurado, `npx playwright test -c playwright.mysql.config.ts face`.
As fixtures de imagem em `tests/fixtures` são sintéticas, da coleção MIT do Human.

## Estoque, mapas e planejamento

Execute `npm run db:migrate` (migração aditiva 002, preserva dados e papéis).
Pedidos pendentes não reservam saldo. Aprovação reserva por local; entrega exige
código e quantidade; cancelamento confirmado libera reserva. Devoluções aguardam
conferência. Pedidos aprovados legados com reserva incompleta devem ser revalidados.
Novas operações usam UTC; horários antigos não são convertidos automaticamente.

Teste com funcionário → líder/admin → almoxarife → confirmação do requisitor.
No estoque, cadastre unidade/categoria, corredor/prateleira, mínimo e capacidade.
No Admin → Planta e rotas, envie PNG/JPEG/WebP até 5 MB, informe metros/pixel,
posicione pontos, trace paredes e caminhos, teste, confira fisicamente e publique.
A imagem não detecta paredes automaticamente. Dijkstra + vizinho mais próximo/2-opt
usam somente ligações cadastradas; sem mapa conectado, a operação é manual.

Os relatórios filtram baixas efetivas por período e escopo; saldos são atuais.
A previsão usa até 180 dias, média diária, prazo, variabilidade e criticidade;
com 90 dias/15 dias ativos compara média móvel e suavização; backtest de 28 dias
exige 60 dias/7 dias ativos. MAE/WAPE são erro histórico, não garantia futura.
Capacidade é em unidades por item/local; não modela volume compartilhado.
Excesso é sugerido antes de compra e requer conferência. Preços são estimativas
internas, sem cotação de mercado, frete ou impostos. PDF e XLSX saem do mesmo relatório.

Integração corporativa: a marca pública é [TOTVS](https://www.totvs.com/totvs-ipaas/),
mas não há confirmação do produto/versão usado pela MARCON, endpoint ou credenciais.
`lib/integrations/corporate.ts` define eventos entrada/saída/transferência/devolução/ajuste,
com chave idempotente, SKU, unidade, quantidade, locais, pedido, ator, data e motivo.
O adaptador está desativado; MySQL é a única fonte oficial de saldo. Antes de ativar,
mapear IDs e definir conciliação/idempotência com o ERP. Nenhum e-mail é enviado:
o projeto não contém configuração de provedor. Não há cotação externa ativa.

Verificações: `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:e2e`;
MySQL: `npx playwright test -c playwright.mysql.config.ts` com `DB_NAME` terminado
em `_test`, seed e `SEED_PASSWORD`; `PLAYWRIGHT_PRODUCTION=1` usa o build na porta 3101.
