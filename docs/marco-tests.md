# Verificação do Marco — 05/10/2026 (São Paulo)

Ambiente: Windows, Node 24.16.0, Edge em modo headless, Ollama 0.35.1, modelo já instalado `qwen3.5:0.8b`, 873.44M parâmetros, Q8_0. `/api/show` informou completion, vision, tools e thinking. Visão não foi integrada; áudio usa os serviços de voz existentes ou APIs do navegador.

| Verificação | Resultado |
| --- | --- |
| Build Next de produção | Passou |
| TypeScript | Passou |
| ESLint | Passou |
| API Express existente | 37 testes, 7 suítes, passaram |
| Testes novos do Marco | 6 grupos passaram: contratos, limites/streaming, navegador com preenchimento/seleção/revisão, configuração de produção, falhas/cancelamento/timeout, ponte/auth/concurrency |
| Regressão de linguagem/áudio | 4 testes passaram; teste de Whisper/Piper com WAV foi pulado por ausência de configuração de áudio de teste |
| Integração real | Next de produção, cookie assinado, JWT Express e PostgreSQL isolado: autorização negada, origem rejeitada, registro inexistente, confirmação adulterada/de outro usuário, gravação real, repetição sem duplicar, estado alterado rejeitado e streaming passaram |
| Ollama pela API do site | Resposta real em português e tempos; nenhuma gravação no pedido de conversa |
| Cancelamento/timeout com Ollama real | Requisição cancelada em 117 ms; timeout de 100 ms encerrou a chamada em 103 ms. Sem operação de negócio |
| Ponte com Ollama real | Chat autenticado em loopback passou; nenhum túnel público usado |
| UI logística existente | Salvamento de vínculo, dashboards, exportações PDF/XLSX e publicação de planta em dados isolados passaram |
| UI do Marco no site real | Comando autenticado, cliente NDJSON, navegação real, seleção em controle React e salvamento nativo confirmado no PostgreSQL passaram |
| Requisição completa pelo Marco | Proposta de carrinho, confirmação, revisão da requisição, rejeição de carrinho alterado no servidor, gravação real e repetição com os mesmos IDs passaram |

No contrato amplo inicial, **1/7** pedidos passou no critério de intenção esperado. Suporte anunciado a ferramentas não implicou interpretação confiável. Em uma chamada nativa simples o modelo retornou `navigate(view=estoque)`, mas isso não prova confiabilidade para alterações. Depois de limitar o modelo a conversa/esclarecimento e deixar alterações em intenções determinísticas/formulários validados, os **7/7** casos de conversa passaram no critério restrito do benchmark. Esses resultados têm critérios diferentes; não representam acerto de 100% em operações arbitrárias.

Medições desta máquina, sem garantia para outras cargas:

| Caminho | Primeiro conteúdo do modelo | Total do modelo | Outros tempos |
| --- | --- | --- | --- |
| Benchmark final, primeira chamada com carregamento | 10.699 ms | 12.899 ms | Carregamento 10.190 ms |
| Seis chamadas subsequentes do benchmark | 416–446 ms | 2.160–2.806 ms | Carregamento 6–8 ms |
| API autenticada + PostgreSQL + Ollama (última execução) | 11.026 ms | 13.128 ms | Servidor total 13.720 ms, carregamento 10.441 ms |
| Entrada de estoque confirmada pela API (última execução) | Não usa modelo | Não usa modelo | Ação/servidor 1.158 ms |
| Ponte local com autenticação + Ollama | 12.078 ms | 14.096 ms | Carregamento 11.732 ms |

A API e a ponte tiveram carregamento e concorrência com outros checks; não foram um ensaio de carga controlado. Os números mostram a diferença entre modelo carregado e carregamento, sem prometer uma latência fixa. Métricas da interface usam primeiro **conteúdo** (não só headers), conclusão completa e tempo da ação confirmada incluindo validação/banco. `modelFirstMs` pode ser nulo se nenhum conteúdo foi recebido.

Transcrição física **não foi medida**. Whisper informa `processingMs` quando usado; no navegador, mede-se o intervalo `soundend → resultado final` somente quando esses eventos chegam nessa ordem, caso contrário aparece “não medida”. Essa métrica não inclui o tempo que a pessoa passou falando.

Evidências locais, excluídas do Git: `.validation/marco/full-contract-model.json`, `read-contract-model.json`, `real-model.json`, `integration.json`, `browser.json`, `cancellation.json` e `.validation/integrated-logistics/evidence.json`. Os scripts permitem repetir os testes sem depender dessas evidências. No Edge testado, reconhecimento, síntese e contexto seguro estavam disponíveis; isso é detecção de API, não prova de áudio físico.

Não verificado: áudio de microfone físico, reconhecimento/qualidade acústica, reprodução audível, Safari/Firefox/móveis, túnel HTTPS externo, domínio/DNS, deployment Vercel e integração de serviços locais de rosto/OCR em produção. Teste de navegador automatizado e disponibilidade de uma API não provam captura real de voz. Conferência física, uploads, senhas e edição/calibração da planta seguem manuais conforme a cobertura documentada.

## Correção do chamado por voz — 06/10/2026

O detector aceitava apenas `Marco`, e a ativação dependia de um segundo clique quando Whisper estava indisponível. Agora aceita `Marco` e `Marcos` (incluindo caixa e pontuação), ativa reconhecimento do navegador quando o servidor informa ausência de transcrição local e mostra `Chamado reconhecido` ao ouvir o nome. O aviso junto ao botão explica o possível processamento de áudio pelo serviço do navegador. A ativação tem timeout de cinco segundos e cancelamento; parar e reativar limpa a deduplicação da sessão anterior.

Build de produção, TypeScript e ESLint dos arquivos alterados passaram. Regressão de linguagem/áudio: **5 passaram, 1 pulado** por ausência de configuração Whisper/Piper para áudio sintético. No site Next real autenticado, eventos Web Speech controlados verificaram os dois nomes com painel recolhido, feedback, transcrição provisória sem ação, nome isolado sem chamada ao modelo, duplicação, reativação, `Marcos, abra estoque` com API/roteador reais, cancelamento, timeout da ativação e recusa de permissão. Teste repetível com `npm run build` e `npm run test:marco:integration`; os dados continuam em schema PostgreSQL temporário.

Essa correção não mede a precisão acústica: não foi usado microfone físico nem serviço real de transcrição do navegador. O usuário ainda precisa ativar a escuta, autorizar o microfone e aguardar `Ouvindo`.
