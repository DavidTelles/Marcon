# PCP, fotos e etiquetas Marcon

O menu **PCP e etiquetas** está disponível ao administrador e ao almoxarife. Funcionários e líderes podem criar e consultar suas requisições no menu PCP; conferência, qualidade, estoque e vínculo de etiquetas exigem permissão de estoque.

## Fotos e Vercel

As 12 fotos do catálogo desta cópia estão em `public/parts` e foram preservadas na integração das alterações. `manifest.json` registra os caminhos, fontes e condições de uso de `data/parts-catalog.json`. `npm run build` verifica que todas as fotos existem e são WebP válidos antes de compilar. Inclua essa pasta no commit/deploy.

Fotos novas são persistidas no Neon pelo cadastro de estoque, em PNG/JPEG/WebP, até 1 MB por foto. O backend aceita 2 MB de JSON para acomodar a expansão base64. Fotos inválidas ou endereços temporários `blob:` são rejeitados. O cadastro solicita a confirmação do produto, origem e condições de uso. O frontend e o backend publicados precisam apontar para o mesmo banco; arquivos em `public` acompanham o deploy, dados do banco não são copiados pelo deploy.

Nesta cópia preparada para hospedagem, o Next.js precisa de `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET` e `BACKEND_URL=embedded`. O backend integrado atende também as rotas PCP, a consulta de produto para impressão de QR e uploads JSON de até 2 MB, sem iniciar um servidor Express separado. Se optar por API externa, use `BACKEND_URL` HTTPS e a mesma URL Neon no Express; a API pode ser publicada com `vercel.api.json` em outro projeto.

## Etiquetas

A migração adiciona os IDs impressos 129, 120, 127, 173, 7988, 17940, 1794, 1796, 1795 e 5746, com descrições legíveis na foto enviada. Ela não cria saldo, preço ou foto para esses produtos. Confirme no cadastro eventuais sufixos de modelo que não estavam legíveis na foto.

Os números impressos identificam o produto; não provam qual texto está codificado dentro do QR antigo. Se o QR contiver outro valor, selecione o produto em **PCP e etiquetas**, abra **Vincular o QR da etiqueta deste produto**, leia uma etiqueta, confira código/modelo, marque a confirmação e salve. O conteúdo é preservado exatamente, inclusive maiúsculas, e não pode pertencer a outro produto. URLs codificadas são tratadas como identificadores, sem acessar sites externos.

Depois do vínculo, a leitura consulta o produto e o saldo permitido ao usuário. Um código desconhecido ou ambíguo não preenche uma operação. O cadastro de estoque também aceita leitura direta para preencher seu campo QR. **Abrir QR para impressão** gera SVG com o conteúdo atualmente vinculado, margem branca de quatro módulos e correção de erros. Imprima com bom contraste e preserve a margem branca.

A câmera usa HTTPS ou localhost, câmera traseira preferencial, leitura em quatro orientações e tentativa de contraste invertido. A leitura de arquivo aceita uma etiqueta por imagem. Há alternativa por digitação/leitor USB. A validação de origem nas rotas de leitor, PCP, importação e estoque considera o Host recebido, para não confundir um alias legítimo com a URL interna normalizada pelo Next.js; origens externas continuam bloqueadas. Permissão da câmera, iluminação, foco e integridade da impressão continuam necessários; os testes usam imagens geradas e uma câmera simulada, não o aparelho físico do usuário nem a folha original anexada.

## API da empresa

As rotas abaixo funcionam no Express com JWT Bearer e no Next com os cookies de login existentes. No Next, alterações exigem `Origin` igual ao domínio da aplicação. Também estão disponíveis sob `/api/pcp/…`. A rota anterior `/api/requisicoes` é preservada para seu fluxo existente.

Todas as alterações exigem `requestKey` único de 16 a 64 caracteres. Repetir a mesma operação com a mesma chave retorna o resultado original. Reutilizar a chave com dados diferentes gera 409. IDs `itemId`, `origemId`, `destinoId` e IDs na URL são IDs internos retornados pela API, não números impressos de etiqueta; use `/api/products/resolve-code` para resolver uma etiqueta.

| Método e rota | Dados ou comportamento |
| --- | --- |
| POST `/recebimentos` | `itemId`, `notaFiscal`, `lote`, `quantidadeNota`, `pesoNota` opcional em kg |
| GET `/recebimentos`, GET `/recebimentos/{id}` | Lista e detalhes, status, nota, lote e contagem |
| PATCH `/recebimentos/{id}/conferencia` | `quantidadeConferida`, `pesoConferido` se houver peso na nota; divergência deixa Pendente |
| POST `/recebimentos/{id}/lancamento-totus` | `modo: "manual"`, `referencia` do comprovante/protocolo; não envia dados ao ERP |
| GET `/recebimentos/{id}/status-qualidade` | Resultado de qualidade e se o lote já liberou saldo ao almoxarifado |
| PATCH `/recebimentos/{id}/validacao-qualidade` | `resultado: "aprovado"` ou `"reprovado"`, `motivo`; exige conferência válida e lançamento |
| POST `/estoque/transferencias` para lote | `recebimentoId`, `destinoId` de almoxarifado, `qrCode`, `quantidadeConferida`; exige qualidade aprovada |
| POST `/requisicoes` | `itemId`, `quantidade`, `origemId`, `destinoId` de produção, `centroCusto`, `ordemProducao` opcional |
| GET `/requisicoes`, GET `/requisicoes/{id}` | Consulta no escopo do usuário |
| GET `/requisicoes/{id}/validacao` | Saldo total e da origem, pedido suficiente, condição de liberação |
| POST `/pedidos-compra` | `requisicaoId`, `quantidade`, `referencia`; registra um pedido local vinculado, sem integração automática com compras externas |
| PATCH `/requisicoes/{id}/confirmar-retirada` | `qrCode`, `quantidadeConferida`; quantidade parcial permanece bloqueada para liberação |
| PATCH `/requisicoes/{id}/liberar` | Exige saldo na origem acima do mínimo, pedido suficiente e quantidade integral conferida; reserva o saldo |
| POST `/estoque/transferencias` para produção | `requisicaoId`, `etapa: "expedir"` ou `"receber"`, `qrCode`, `quantidadeConferida`; confirma separadamente os eventos físicos |
| GET `/consumiveis/categorias` | Categorias de produtos classificados como consumíveis |
| POST `/consumiveis/requisicoes` | `itemId`, `quantidade`, `origemId`, `centroCusto` |
| PATCH `/consumiveis/requisicoes/{id}/baixa` | `qrCode`, `quantidadeConferida`; baixa direta, sem transferência |
| GET `/estoque/{itemId}/saldo?armazem=almoxarifado` | Saldo físico, disponível e locais autorizados |
| GET `/estoque/{itemId}/saldo?armazem=producao` | Saldo na produção |
| GET `/estoque/{itemId}/saldo?armazem=aguardando-qualidade` | Quantidade contada em custódia de recebimento; disponível zero |
| GET `/estoque/{itemId}/historico-transferencias` | Transferências e lotes liberados ao almoxarifado |

O cadastro de estoque oferece o tipo Matéria-prima, Componente, Embalagem ou Consumível. O administrador configura o armazém físico de produção no menu PCP: pode classificar um armazém existente ou cadastrar outro. POST `/api/pcp/armazens` recebe `codigo`, `nome`, `tipo: "almoxarifado"` ou `"producao"`; PATCH `/api/pcp/armazens/{id}` recebe `tipo`. GET lista IDs e tipos. A classificação exige concluir as operações pendentes; o armazém central permanece como almoxarifado. Funcionários/líderes precisam de um armazém de origem vinculado ao seu bloco. Vínculo de QR: PATCH `/api/pcp/produtos/{id}/qr`, com `qrCode` e `confirmado: true`.

O lote aguardando qualidade permanece em custódia no documento de recebimento, separado do saldo disponível de `inventory`. Sua entrada física aprovada gera um movimento de entrada. Requisições de produção usam o mesmo livro de transferências e movimentos do restante da aplicação; sua reserva também é descontada das demais consultas e operações. Consumíveis geram apenas uma saída. As operações são atômicas e auditadas.

O estoque existente trabalha com quantidades inteiras. Pesos de conferência aceitam até seis casas decimais e precisam coincidir com a nota; não há tolerância presumida. Para movimentar saldo fracionário em kg/metragem, será necessário definir a conversão/unidade com a empresa antes de mudar o livro de estoque inteiro.

O texto fornecido especifica rotas, não uma API externa acessível. O lançamento automático no **Totus** continua pendente de URL, produto/versão, autenticação e contrato de integração. `modo: "integracao"` retorna 501; o registro manual está operacional.

## Aplicação e testes

```bash
npm ci
npm ci --prefix backend
npm run db:migrate
npm run build
npm run test:api
npm run test:request-origin
npm run test:pcp
npm run test:pcp:ui
npm run test:pcp:embedded
```

Publique o projeto Next com `BACKEND_URL=embedded` e execute a migração no banco usado por ele. `test:pcp` e os testes de UI criam e removem apenas um schema temporário exclusivo no Neon; não alteram o estoque público. Os testes de UI usam o build real, confirmam as fotos com HTTP 200, leitura de arquivo e câmera simulada, vínculo persistido e layout móvel. `test:pcp:embedded` exercita esse fluxo pelo backend integrado. Evidências ficam em `.validation/pcp`.
