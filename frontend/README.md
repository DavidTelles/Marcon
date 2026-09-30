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

### Reconhecimento facial com Python e OpenCV

Instale Python 3.10+ no servidor e execute `python -m pip install -r face/requirements.txt`
na pasta `frontend`. Se necessário, defina `FACE_PYTHON` com o caminho do
executável Python. Os modelos YuNet e SFace ficam em `face/models`.
Execute `npm ci`, `npm run db:migrate` e configure `SESSION_SECRET`
e MySQL. Em localhost ou HTTPS, entre com senha, abra `/profile` e
cadastre cinco fotos com consentimento. No login, informe matrícula/e-mail
e use a câmera. O servidor extrai vetores SFace e compara com similaridade
cosseno mínima de 0,363, conforme o protótipo Python fornecido.

As fotos são enviadas para análise e descartadas após a requisição. Apenas
vetores são armazenados, criptografados com AES-256-GCM. Cadastros anteriores
do modelo Human precisam ser refeitos. Excluir o cadastro, login com senha
e passkeys continuam disponíveis. Há limite de cinco tentativas por conta
a cada 15 minutos. Este fluxo não oferece prova robusta de presença:
câmeras virtuais e imagens manipuladas podem burlá-lo.

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
