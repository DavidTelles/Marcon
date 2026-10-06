# Marco com Ollama

Implementação em Next.js 16 / React 19, Express e PostgreSQL Neon. O nome exibido é Marco; arquivos e rotas `james` permanecem para compatibilidade. Alterações anteriores do workspace foram preservadas. O modelo não recebe senha, JWT, token da ponte ou acesso livre ao banco.

## Desenvolvimento local

1. Use Node 24 LTS e as dependências existentes (`npm ci` e `npm ci --prefix backend`). Preserve os segredos de autenticação e a conexão do banco no `.env`.
2. Adicione as variáveis `MARCO_*` de `.env.example`. Os padrões já usam `http://127.0.0.1:11434` e `qwen3.5:0.8b`.
3. Execute `npm run marco:doctor`. O comando inspeciona versão, modelo instalado e capacidades; não baixa modelos. Se o Ollama não estiver ativo, inicie-o no aplicativo Ollama ou com `ollama serve`.
4. Execute `npm run dev`, faça login e abra Marco. Digite primeiro um comando, por exemplo `abra estoque` ou `procure parafuso`.
5. Para voz, clique em **Ativar escuta** e autorize o microfone. Quando o servidor informa que Whisper local está indisponível, a escuta usa automaticamente o reconhecimento do navegador, conforme o aviso junto ao botão. Aguarde **Ouvindo** e diga `Marco` ou `Marcos`; o painel abre e mostra **Chamado reconhecido**. Também pode dizer `Marcos, abra estoque` em uma frase. A autorização inicial exige interação manual. Se a verificação local falhar ou exceder cinco segundos, use o botão **Usar reconhecimento do navegador** ou texto. **Cancelar ativação** impede uma resposta atrasada de ligar o microfone.

Ollama não transcreve fala nem sintetiza áudio neste modelo. Whisper.cpp/Piper locais continuam opcionais pelas variáveis existentes. Na Vercel esses executáveis locais são desativados; a interface oferece reconhecimento e síntese do navegador. Reconhecimento pode enviar áudio ao fornecedor do navegador e depender da internet. Não foi contratado serviço de voz. Texto e controles continuam disponíveis quando o navegador não oferece voz. Veja [compatibilidade e processamento do reconhecimento](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## Segurança e interpretação

O comando chega à sessão autenticada Next e utiliza o JWT já emitido pelo Express. Consultas usam o snapshot permitido daquele usuário. Operações continuam na camada compartilhada `james-operations` / `workspace-actions`, com validação, autorização e transações das telas existentes. Administração de usuários exige `people`; estoque, transferências e devoluções exigem `stock`; planejamento exige `planning`; mapa exige `map`. Requisições e aprovações também verificam titular, bloco, registros e estado atual. As permissões reais do servidor prevalecem sobre o contexto do modelo.

Operações do assistente exigem resumo e confirmação HMAC vinculada ao usuário, perfil, bloco, ação, parâmetros e validade de 10 minutos. O servidor compara novamente o estado usado no resumo. Confirmar requisição também exige enviar o carrinho exato revisado; alteração exige nova revisão. Chaves persistidas em `request_submissions` protegem os comandos de negócio contra repetição, inclusive entre processos. Não há retry automático de gravação; após perda de conexão consulte o resultado antes de iniciar uma nova operação.

O `qwen3.5:0.8b` anunciou suporte a ferramentas e produziu uma chamada nativa válida no teste simples. Porém, o contrato amplo acertou só **1/7** pedidos. Exemplo: em `abra estoque`, copiou um exemplo de conversa; em uma correção, misturou conversa com transferência e inventou um almoxarifado. Por isso **chamadas de ferramenta geradas pelo modelo não executam ações**. O modelo fica restrito a conversa/esclarecimento JSON validado; comandos explícitos e formulários guiados fazem as operações reais. Pedidos fora desse conjunto exigem esclarecimento. Isso não equivale a um agente autônomo para qualquer frase.

Contexto e registros são dados, não instruções. O contrato do modelo só aceita `chat/answer`; respostas inválidas ou alegações reconhecidas de execução são rejeitadas. As mensagens automáticas de revisão e resultado são identificáveis como fluxo da aplicação, sem fingir que vieram do modelo. Respostas do modelo continuam sujeitas a erros de linguagem e conteúdo.

O histórico enviado é limitado a quatro trechos de 400 caracteres; carrinho até 30 itens, mensagem até 2.000 caracteres. Geração usa `think:false`, temperatura zero, contexto padrão 4.096 e saída até 512 tokens. `keep_alive` padrão de 300 segundos evita recarregamento entre pedidos próximos e pode ser reduzido se houver pressão de memória. Não há memória de conversa durável; os registros de negócio e a proteção de duplicação ficam no banco.

Streaming NDJSON transmite estados interpretando/executando/respondendo e entrega o resultado após validação. JSON parcial do modelo nunca vira ação na interface. Cancelamento interrompe inferência e leitura. Uma gravação já enviada pode terminar; interromper a resposta não desfaz uma transação.

## Comandos cobertos

Os comandos abaixo passam pelo mesmo caminho quando digitados ou transcritos. Acesso depende do perfil e do registro; uma proibição continua sendo proibição por voz.

| Função | Exemplo / fluxo |
| --- | --- |
| Navegar | `abra catálogo`, `abra estoque`, `abra requisições`, `abra transferências`, `abra rotas`, `abra recomendações`, `abra compra`, `abra mapa`, `abra perfil`, `abra histórico`, `abra funcionários`, `abra devoluções`, `abra nova`, `abra dashboard`; `voltar` |
| Buscar e escolher peça | `procure parafuso`; diga o código ou `o segundo` entre as opções reais apresentadas |
| Carrinho | `quero cinco unidades de CODIGO`, `mostre meu carrinho`, `na verdade cinco unidades`, `remova CODIGO`, `justificativa: manutenção`, `faça a requisição`; revisão e confirmação explícita |
| Consultar/exportar | `consulte dashboard de estoque`, depois `exportar em PDF` ou `exportar em planilha`; `consulte requisições`, `consulte recomendações`; `baixar relatório` |
| Requisições | `aprove a requisição ID`, `coloque a requisição ID em análise`, `altere a quantidade da requisição ID para 5 unidades`, `exclua a requisição ID`, `solicite cancelamento da requisição ID, motivo: ...`, `confirme meu recebimento da requisição ID` |
| Estoque/transferências/rota | `registre entrada de 5 unidades do código CODIGO em ALMOXARIFADO, motivo: ...`; `ajuste o saldo do código CODIGO em ALMOXARIFADO para 5 unidades, motivo: ...`; `solicite transferência de 5 unidades do código CODIGO, de ORIGEM para DESTINO, motivo: ...`; `cancele a transferência ID, motivo: ...`; `calcule a rota da requisição ID` |
| Formulários guiados | `cadastrar peça`, `editar peça`, `desativar peça`, `editar usuário`, `alterar status de usuário`, `atualizar preço`, `solicitar transferência`, `registrar entrada`, `ajustar saldo`, `registrar devolução`, `conferir devolução`, `registrar entrada prevista`, `cancelar entrada prevista`, `receber entrada prevista`, `confirmar saída de transferência`, `confirmar recebimento de transferência`; cada campo é solicitado e validado; `corrigir nome do campo` |
| Campos da tela | `preencha Nome com ...`, `corrija Nome para ...`, `selecione Local como ...`, `pesquise ...`; exige um único controle visível identificado pelo rótulo |
| Salvar formulário da tela | `salvar`, resumo dos campos, `confirmar formulário`; mudanças invalidam a revisão. Só formulários nativos identificáveis com um único botão Salvar/Enviar/Cadastrar/Criar. Dispara o fluxo original e não anuncia gravação antes do resultado |
| Resultado / controle | `ler resultados`, `ler erros`, `cancelar`, `interromper`, `parar de falar`, `repita a resposta`, `pausar escuta`, `desligar escuta`, `recolher` |

Campos de senha, arquivos, autenticação inicial, cadastro facial, escolha de câmera/leitura física de QR, conferência física, upload/importação, edição por arraste no canvas, revisão/calibração/publicação da planta e controles sem formulário/rótulo inequívoco **ainda exigem interação manual**. Não foram inventadas ferramentas para contornar essas etapas. A sugestão de pontos e as rotas dependem de planta publicada e vínculos físicos válidos, como nas regras já existentes.

O microfone pausa durante a leitura e na aba oculta; a sessão de conversa dura 90 segundos após chamar Marco. Transcrições finais iguais em menos de três segundos são ignoradas. Silêncio reinicia reconhecimento com atraso limitado; erros de permissão/conexão mostram alternativa por texto. Desligar escuta ou sair da conta encerra captura. Como o microfone fica suspenso durante a resposta, para interromper áudio use o botão **Interromper fala** ou digite o comando; não se promete ouvir comandos enquanto o próprio Marco fala.

## Vercel e ponte no PC

Fluxo: navegador → Next na Vercel → HTTPS do túnel → ponte autenticada no PC (`127.0.0.1:11435`) → Ollama (`127.0.0.1:11434`). O PC precisa permanecer ligado, conectado, com Ollama, ponte e túnel ativos. Nenhuma porta do roteador foi aberta e nenhum túnel público foi ativado.

1. Configure dois projetos a partir da raiz deste repositório: frontend Next com `vercel.json`; backend Express com `vercel.api.json` (`vercel --local-config vercel.api.json` quando você decidir publicar). A configuração do segundo instala também as dependências de `backend`. O Express exporta o app existente; não mantém um servidor local dentro da função.
2. Frontend: `DATABASE_URL`, `SESSION_SECRET`, `BACKEND_URL=https://URL_DO_BACKEND`, `MARCO_MODE=bridge`, `MARCO_OLLAMA_URL=https://HOSTNAME_DO_TUNEL`, `MARCO_BRIDGE_TOKEN` e demais limites `MARCO_*`. Backend: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` e `CORS_ORIGIN=https://URL_DO_FRONTEND`. Segredos fortes somente no servidor. Não publique `SEED_PASSWORD`.
3. No PC, gere um token aleatório de pelo menos 32 caracteres (recomendado 32 bytes em hexadecimal), guarde-o no `.env` ignorado pelo Git e configure o mesmo token no frontend da Vercel. Execute `npm run marco:bridge`. Ele escuta **somente loopback**, sem criar exposição.
4. Prepare um túnel HTTPS, por exemplo Cloudflare Tunnel com hostname estável e conta/domínio adequados. Revise o plano e eventuais custos do provedor antes de configurar. Use `ops/marco-tunnel.example.yml`, substitua os identificadores e mantenha credenciais do túnel fora do repositório. O destino é **11435**, nunca a API bruta do Ollama. Siga a [configuração oficial](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/) e [criação do túnel](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/). Ativação, DNS e publicação são etapas externas pendentes; este trabalho não as executou.
5. Depois de autorizar/configurar o túnel, valide health com autenticação e uma conversa na URL publicada. Configure `MARCO_MODE=bridge` na Vercel mesmo se tiver copiado as variáveis locais; o código também detecta `VERCEL` e rejeita HTTP/localhost/credencial ausente. `BACKEND_URL` publicado também rejeita localhost.

A ponte só atende health autenticado e POST `/api/chat` com modelo fixo configurado e schema exato. Aceita até 40 KB, contexto textual limitado, concorrência padrão 1 (máximo 2), timeout máximo 45 s, saída até 200 KB e opções de geração fixadas no PC. Rejeita pull, generate, tools, URLs e operações arbitrárias. Bearer é comparado em tempo constante; CORS não é autenticação. A trava por usuário na rota Next é por processo; o limite global de inferência fica na ponte e idempotência de negócio fica no banco.

A rota Next reserva até 60 s, com inferência até 45 s e orçamento de interpretação de 55 s; o navegador aguarda até 60 s. A configuração segue [API de chat do Ollama](https://docs.ollama.com/api/chat), [duração de funções Vercel](https://vercel.com/docs/functions/configuring-functions/duration) e [streaming Vercel](https://vercel.com/docs/functions/streaming-functions). Não há processo Ollama dentro da Vercel. OCR, reconhecimento facial Python e qualquer binário local do restante do site precisam de validação própria antes de publicar; preparar o Marco não valida esses serviços em serverless.

## Verificação

Execute `npm run test:marco`, `npm run test:marco:regression`, `npm run marco:benchmark`, `npm run test:marco:cancel`, `npm run build`, `npm run test:marco:integration`, `npm run test:api`, `npm run lint` e `npx tsc --noEmit`. A integração usa esquema temporário no PostgreSQL real e remove apenas o esquema criado pelo teste. Não roda seed nem altera registros de uso. Consulte [resultados e medições](marco-tests.md).
