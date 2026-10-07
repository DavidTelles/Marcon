# Cobertura histórica — revisão de 27/09/2026

Este documento registra o estado anterior. Para o Marco com Groq, veja [configuração e cobertura atual](../../docs/marco-groq.md). Resultados históricos com outros provedores não validam a implementação atual.

F = funcionário; L = líder (somente seu bloco); M = almoxarife; A = admin.
“Passou” abaixo significa o caminho indicado de API/banco ou texto. **Nenhuma linha certifica reconhecimento com microfone físico**: esse estágio depende de dispositivo/permissão. Transcrições controladas verificam somente o ciclo da interface.
“Falhou — cobertura” indica uma meta de automação ainda não entregue, não uma falha do fluxo manual existente.

| Perfil | Tela | Ação / comando falado ou digitado | Resultado esperado | Verificação |
|---|---|---|---|---|
| F/L/M/A | James | “Bom dia, James. Como vai?” | Saudação pelo horário de São Paulo; nenhuma ação | Passou: API e Neon, sem mutação |
| F/L/M/A | James | “Como você está hoje?” / “Obrigado” | Conversa breve, sem alegar emoções | Passou: API autenticada |
| F | James | “Explique por que o céu é azul” | Resposta geral, sem chamar ferramentas de negócio | Passou: NVIDIA real; chegou a levar ~40 s |
| F | Catálogo/carrinho | “Coloque 7 caixas do código X e 10 porcas do código Y, revise e faça a requisição” | Usa embalagem cadastrada; pede justificativa quando exigida; não envia sozinho | Falhou na repetição final: timeout NVIDIA de 45 s. Uma execução anterior completa passou com API/Neon reais |
| F | Carrinho | “Troque as caixas para 5” / “Troque para 5 caixas” | Corrige quantidade usando tamanho da embalagem | Passou: ambas as formas na API/Neon; a segunda foi testada separadamente da chamada ao provedor |
| F | Catálogo | “Escolha a segunda” | Resolve opções do resumo assinado, sem trocar IDs | Passou: resolução na API/Neon; descoberta inicial usa interpretação controlada no teste |
| F | Requisições | “Faça a requisição” → “Confirmar requisição” | Cria pedidos uma vez; reserva/baixa não são antecipadas | Passou: API/Neon e reenvio do mesmo token |
| F | Histórico | “Altere a quantidade da requisição 123 para 3 unidades” | Resumo → confirmação → edição antes da aprovação | Passou: API/Neon; rejeita resumo se dados mudaram |
| F | Histórico | “Exclua a requisição pendente 123” | Confirmação antes da exclusão lógica | Passou: API/Neon |
| F | Histórico | “Solicite cancelamento da requisição 123, motivo: material não necessário” | Solicita cancelamento após aprovação; não inventa liberação de reserva | Passou: API/Neon |
| F | Histórico | “Confirme meu recebimento da requisição 123” | Registra recebimento próprio de pedido entregue | Passou: API/Neon; depende de conferência física real |
| L/A | Requisições | “Coloque a requisição 123 em análise” / “Aprove a requisição 123” | Confirmação, transição e reserva oficiais | Passou: API/Neon; reserva única; nega outro bloco e funcionário |
| M/A | Transferências | “Solicite transferência de 3 unidades do código X, de Central para Estoque A, motivo: reposição planejada” | Solicita; não movimenta saldo; protege mínimo e reservas | Passou: API/Neon, inclusive duplicidade |
| M/A | Transferências | “Cancele a transferência 123, motivo: programação alterada” | Cancela somente antes da saída | Passou: API/Neon |
| M/A | Estoque | “Registre entrada de 3 unidades do código X em Central, motivo: recebimento conferido” | Confirmação; entrada auditada, sem repetir | Passou: API/Neon; depende de conferência física real |
| M/A | Estoque | “Ajuste o saldo do código X em Central para 100 unidades, motivo: contagem conferida” | Mostra antes/depois; preserva reservas e capacidade | Passou: API/Neon e duplicidade; depende de contagem física real |
| M/A | Entregas/rotas | “Calcule a rota da requisição 123” | Confirma registro do plano usando serviço/mapa existentes; sem baixa | Passou: API/Neon e histórico; mapa real da fábrica não validado |
| F/L/M/A | Consultas | “Procure parafusos” | Código, unidade, embalagem, disponível e locais reais | API/banco testados; interpretação controlada na regressão |
| F/L/M/A | Requisições | “Acompanhe minhas requisições” | Até 5 registros do período, no escopo autorizado | API/banco testados; interpretação controlada na regressão |
| L/M/A | Dashboards | “Dashboard do meu bloco” / filtros de período | Definições e valores reais; lê até 5 indicadores; detalhes na tela | Escopos/filtros testados com interpretação controlada; leitura falada depende de voz |
| F/L/M/A | Relatórios autorizados | “Exportar requisições em PDF” / “Baixar relatório” | Arquivo do endpoint oficial com filtros/permissões | Passou: PDF/planilha reais e comando de download por texto; descoberta usa interpretação controlada |
| M/A | Compra/recomendação | “Abra recomendações de estoque” / “Exportar estoque em planilha” | Tela e relatório autorizados; nenhuma movimentação automática | Navegação/exportação com interpretação controlada |
| F/L/M/A | Navegação | “Abra catálogo/histórico/perfil”; telas extras conforme perfil | Usa rotas existentes; valida permissão antes de devolver destino | Rotas adicionadas; falhou — cobertura completa ainda não testada |
| A | Pessoas | Cadastro/edição/status/permissões por voz | Formulário completo e gravação autorizada | Falhou — cobertura: apenas navegação; preencher tela segura |
| F/L/M/A | Perfil | Senha, passkey e biometria | Atualização segura sem ditar senha ao modelo | Depende de tela segura/câmera/permissão; não automatizado |
| M/A | Estoque | Cadastro/edição/desativação de peça por voz | Formulário cadastral completo | Falhou — cobertura: usar formulário atual |
| M/A | Entregas/transferências | Escanear, confirmar quantidade, saída e recebimento | Leitura e conferência física; APIs atuais | Depende de ação física/permissão; James não fabrica leitura |
| M/A | Devoluções/reposições | Registro, inspeção, entrada prevista/recebida | Fluxos completos existentes | Falhou — cobertura por voz; conferência física continua necessária |
| A | Planta | Upload/OCR, editar pontos/bloqueios, revisar/publicar | Arquivo e revisão do mapa real | Depende de arquivo/revisão; falhou — edição/publicação por voz não implementada |
| M/A | Rotas | Destinos adicionais, bloqueios, saída de entrega | Edição/teste/publicação e saída conferida | Falhou — parâmetros de múltiplas paradas por voz não expostos; algoritmo existente preservado |
| F/L/M/A | James/voz | James/Jhames, pausa, recolher, navegar, logout | Escuta local após ativação; pausa durante síntese e aba oculta | Depende de dispositivo/permissão; eventos controlados não provam áudio físico |

## Evidência e limites

- `james-live.spec.ts`: NVIDIA real, comando encadeado, embalagem, correção e envio único, com Neon descartável.
- `james-operations-live.spec.ts`: conversa geral no provedor real; 11 operações explícitas executadas pelo backend com quatro contas e conferência no banco. Os comandos explícitos dispensam inferência do modelo; isso não mede compreensão irrestrita de português.
- `james.spec.ts` e `james-listening.spec.ts`: modelos/eventos de fala controlados para regressão, falhas e ciclo de recursos; nunca apresentados como prova de microfone real.
- `james-conversation-ui.spec.ts`: navegador + API/Neon sem mocks, saudação, confirmação/cancelamento e larguras de 320 a 1440 px.
- Resultado: 12 testes de interface/regressão passaram. Na rodada final de 6 testes, 5 passaram (incluindo repetição da interface, quatro perfis, concorrência de estoque e posições/teclado) e 1 falhou por timeout da NVIDIA no comando encadeado. Lint, tipos e `npm run build` passaram. Microfone físico e hardware móvel real não foram testados.
- Imagens de 320, 768 e 1440 px e paisagem 740×320 inspecionadas. O painel usa rolagem integral em área visível curta, incluindo teclado virtual, para preservar a leitura do resumo. Isso não certifica todos os estados em todos os aparelhos.
- Limites: uma operação que grava dados por mensagem; confirmação explícita; token por usuário/perfil/bloco, válido por 10 minutos; mesma confirmação reaproveita resultado. Novo resumo cria uma nova intenção. Não há busca de fatos externos atuais nem controle universal de formulários.
- NVIDIA apresentou timeouts e uma resposta fora do formato durante a revisão. O formato da conversa foi esclarecido e retestado com sucesso; a chamada geral final levou 7 s, e o comando encadeado final falhou por timeout. Nenhuma ação foi executada nesse erro. Não há resposta de texto transmitida token a token; há estado imediato e tempo decorrido real.
- A referência CodePen não pôde ser acessada. Nenhum recurso externo foi copiado; foram preservados os efeitos próprios e o símbolo original.

## Configuração

`NVIDIA_API_KEY` no servidor; `NVIDIA_MODEL` opcional (padrão `openai/gpt-oss-20b`). Migrações existentes, incluindo `004_request_submissions`, devem estar aplicadas. Não foi criada uma segunda base de estoque ou autenticação.

Transcrição: Web Speech API local quando disponível; opção online exige aceite explícito e pode enviar áudio ao serviço do navegador. Síntese: voz portuguesa local do sistema. Ative **Ativar escuta** uma vez; recolher e navegar preservam a intenção de escuta. Não funciona com aba fechada e não promete captura em segundo plano.
