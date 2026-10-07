# Marco com Groq

A conversa do Marco usa `POST https://api.groq.com/openai/v1/chat/completions`, autenticado exclusivamente no servidor. O modelo padrão é `openai/gpt-oss-120b`, servido pela Groq. A integração usa streaming SSE e modo JSON; a resposta ainda passa pelo contrato de conversa do Marco. O modelo não executa operações: estoque, cadastros e requisições continuam usando permissões, formulários e confirmação existentes.

## Configuração

```dotenv
GROQ_API_KEY=SUA_CHAVE_GROQ
GROQ_MODEL=openai/gpt-oss-120b
MARCO_TIMEOUT_MS=45000
MARCO_MAX_TOKENS=1024
```

Configure no `.env` e reinicie `npm run dev`. Na Vercel, adicione as mesmas variáveis nas configurações do projeto Next, selecione os ambientes necessários e faça novo deploy. Não use `NEXT_PUBLIC_`. A chave não entra no Git, no endpoint de diagnóstico, nas respostas ou nos logs. `.env.example` contém apenas um campo vazio para a credencial.

Não é necessário executar Ollama, ponte ou túnel. As antigas variáveis `MARCO_OLLAMA_*`, `MARCO_MODE` e `MARCO_BRIDGE_*` não são usadas pela conversa. Os arquivos Ollama remanescentes são históricos; seus testes não validam a Groq.

Os caminhos `JAMES_WHISPER_*` e `JAMES_PIPER_*` são da voz local e não são chaves da Groq. A troca do provedor de conversa não instala modelos de voz. O reconhecimento/síntese do navegador continua usando o fluxo existente quando disponível.

## Verificação

`npm run marco:doctor` verifica a credencial e a disponibilidade do modelo sem imprimir a chave. `npm run marco:benchmark` testa conversa real em português e grava apenas métricas/resultados em `.validation/marco/groq-model.json`. `npm run test:marco` verifica os contratos, o streaming, falhas, timeout e cancelamento com transporte controlado; testes históricos Ollama continuam separados por arquivo. `npm run build` verifica a integração Next/TypeScript.

O cliente encerra chamadas interrompidas, rejeita streams incompletos, respostas truncadas e chamadas de ferramentas. Erros de autenticação, modelo e limite de uso geram avisos seguros. Não há repetição automática de inferência ou de operações.

Referências: [API e parâmetros](https://console.groq.com/docs/text-chat), [modelos](https://console.groq.com/docs/models), [modo JSON](https://console.groq.com/docs/structured-outputs).

## Validação em 06/10/2026 (São Paulo)

A credencial foi aceita pelo endpoint de modelos; `openai/gpt-oss-120b` está disponível para ela. O modelo Llama inicialmente considerado não estava disponível e não foi mantido na configuração.

Passaram os quatro grupos específicos da Groq (contrato/configuração, SSE fragmentado, falhas/limites e cancelamento/timeout), os contratos existentes e o teste de origem. O benchmark real passou os três casos de conversa: definição de almoxarifado, esclarecimento de material ambíguo e consulta sem inventar saldo. O cancelamento e o timeout também passaram contra a API real.

O teste integrado passou com Next de produção, sessão assinada, JWT Express e schema PostgreSQL temporário: resposta real da Groq, navegação no navegador, confirmação exata, operação persistida, rejeição de alterações e repetição sem duplicação. Os dados de produção não foram usados nas operações de teste. Houve falhas intermitentes de conexão em execuções anteriores; elas foram apresentadas como erro, sem repetir inferência automaticamente. Estes testes não são um ensaio de disponibilidade da Groq.

O build/TypeScript e o ESLint passaram. Uma inspeção do bundle público não encontrou a chave. As evidências locais ficam em `.validation/marco/groq-model.json`, `integration.json` e `cancellation.json`; não entram no Git. Não foi feito deploy na Vercel.
