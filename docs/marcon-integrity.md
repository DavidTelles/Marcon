# Correções MARCON — evidências e pendências

## Implementação

- Importação XLSX: `lib/material-import.ts`, `/api/items/import`, seção de importação no estoque. Mapeamento explícito, prévia, 48 linhas, SHA-256, transação, repetição idempotente, arquivo/aba/linha, conflitos, parâmetros e programação originais. Filiais são códigos textuais; saldos e compras ficam separados do estoque. Consumo agregado não gera movimentação. Parcelas selecionadas explicitamente são somadas e comparadas ao pedido; “NÃO COMPRAR” é preservado.
- Conciliação usa `reconcileImportBalance` em `lib/inventory-actions.ts`: abertura somente sem operações no local; contagem física atual pelo ajuste oficial; confirmação e auditoria obrigatórias. Não sobrescreve histórico. Repetição é recusada.
- Leitura QR/barras: componente existente com câmera e imagem via ZXing; resolução exata e autenticada em `/api/products/resolve-code`, proxy `/api/items/resolve`. Sem execução de URLs. `face/decode_qr.py` registra conteúdo e polígonos de cada código detectado; vínculo exige confirmação, sem OCR. Fotografias só aparecem após confirmação do modelo, origem e condições de uso; caso contrário, “Imagem não disponível”.
- `backend/src/services/requestService.js`, repositório e snapshot: funcionário consulta histórico próprio; líder usa bloco vinculado no servidor, sem vínculo recebe 403; almoxarife não exclui pedidos de terceiros. Cancelamentos oficiais preservam registro e auditoria.
- Dashboard do líder reutiliza `lib/parts-consumption.ts`, filtros, tabela, gráfico, origens e exportação. Quantidade entregue = baixas vinculadas a pedidos entregues, pela data da entrega em UTC. Solicitação é coorte pela criação; pendência é solicitado menos baixas vinculadas. Transferências e devoluções ficam separadas. Consumo efetivo não é presumido; unidades são separadas; percentual anterior zero permanece sem base.
- Marco: nome, saudações e palavra de ativação alterados; preferências legadas migradas. Caminhos `/api/james` e contratos internos mantidos. Escuta e chamadas abortadas ao logout. “Voltar ao topo” procura o contêiner real, aceita teclado e movimento reduzido.
- Passkey e RFID removidos dos fluxos ativos, APIs e dependências exclusivas. Tabelas e migrações históricas permanecem para preservar dados legados; não há leitor ou login RFID ativo.
- Face: Python YuNet/SFace real, validações de rosto único, posição e captura repetida, limiar 0,363 preservado. Biometria cifrada, desafios e limites no servidor. Sessão backend emitida por autorização opaca de uso único; ID enviado pelo navegador não autentica. Senha obrigatória até validação física de resistência a foto/vídeo. Python local: `face/.venv`; alternativa `FACE_PYTHON`.
- `lib/industrial-links.ts`, `/api/industrial-links` e editor da planta: IDs e FKs para filial/bloco/setor/local/usuário/ponto; pontos publicados persistidos; publicação protege locais vinculados. Requisições preservam IDs do destino. Rotas usam IDs, sem associação por nomes. Dijkstra separa distância e tempo, exige duração para tempo, rejeita pesos inválidos e não inventa caminho. Recomendações existentes preservadas, com aceite no fluxo oficial.

## Verificação

| Requisito | Estado | Evidência e limite |
|---|---|---|
| Importador transacional e repetível | verificado | `node scripts/test-marcon-integrity.mjs`: 48 linhas **sintéticas**, filiais 0101/0102 separadas, conflito 600/450, rollback, nenhuma baixa fictícia |
| Importação dos 48 registros reais | não testado | `rodizios.xlsx` não localizado; **zero linhas originais importadas** |
| QR → API → saldo e permissões | verificado | API Express/JWT/repositórios com PostgreSQL persistido: código exato, saldo por bloco, desconhecido 404, ambiguidade 409; 120 não resolve para 128 |
| QR originais, fotografias e PDF | não testado | `fig01.jpeg` e `rotas-pcp-marcon (1).pdf` não localizados; não há vínculo confirmado ou reprodução da planta |
| Isolamento de histórico | verificado | Chamadas diretas à API: funcionário, líder, líder sem vínculo e exclusão por almoxarife |
| Dashboard e exportações | verificado | `scripts/test-parts-consumption.mjs`: 31 un separados de 80 kg; P1 11 un/3 retiradas; devoluções 3 un; origens, tabelas, gráficos, PDF/XLSX e limites UTC reconciliados. Líder: 3+2=5 un no bloco autorizado |
| Transferência e conciliação | verificado | API oficial: abertura não sobrescreve operação; repetição recusada; transferência 90+50=140 conservada; dupla saída/recebimento recusados; excedente 20 não distribuído duas vezes |
| Hierarquia e Dijkstra | verificado | PostgreSQL persistido/FKs/publicação; caminho conhecido, sentido único, bloqueio, desconexão, origem=destino, peso inválido, tempo e unidades do mapa |
| Sessão facial backend | verificado | Endpoint JWT real, autorização opaca consumida uma vez, login somente com ID recusado; não comprova captura completa pelo navegador |
| Python/modelos faciais | verificado | `face/.venv/Scripts/python.exe scripts/test-face-python.py`: extração real de cinco vetores/128 dimensões, nenhum/vários rostos, quadro repetido, pose incorreta e imagem ilegível; fixture sintética |
| Identidades humanas, câmera e antifraude | não testado | Sem amostras autorizadas ou teste físico. Foto/vídeo não têm resistência validada; senha alternativa e confirmação por senha permanecem |
| Interface das dashboards existentes | verificado | 4 testes Playwright/Edge: desktop, tablet, celular, origens, resposta antiga, erro/repetição, filtros e exportação |
| Marco, voz física e retorno ao topo | não testado | Código implementado; validação física de microfone/logout e inspeção visual específica pendentes |
| ERP, rotas/processos do PDF e indústria | não testado | Fontes e vínculos físicos ausentes. Não foram inventados retornos ERP, locais, coordenadas ou rotas |
| Código | verificado | Lint, tipos, build Next.js (55 páginas) e 37 testes backend passaram |
| Login sem recursos retirados e política biométrica | verificado | 3 testes adicionais Playwright: passkey/RFID ausentes, endpoints 404, limiar/consistência de cinco vetores e cifragem vinculada ao usuário |

Detalhes locais: `.validation/marcon-integrity/evidence.json`, `face-evidence.json` e `.validation/parts-consumption/`. Os testes usam banco isolado persistido e migrações reais, sem `DATABASE_URL` e sem alterar dados de produção. Adaptação de conexão/configuração de teste não comprova integração com ERP ou implantação no Neon remoto.

## Configuração pendente

Aplicar `0005_marcon_integrity.sql` pelo `npm run db:migrate` no banco de desenvolvimento escolhido antes de usar os novos vínculos e importação. A migração foi aplicada e testada no PostgreSQL isolado; não foi aplicada ao banco remoto. Configurar filiais, locais, setores e pontos reais na seção do editor da planta; resolver os conflitos da prévia. Disponibilizar os três arquivos originais para importação, leitura individual dos códigos e mapeamento fiel dos processos. Validar captura facial e voz com pessoas autorizadas, câmera e microfone reais. Nenhum teste físico na indústria foi declarado concluído.
