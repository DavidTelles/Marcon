# Catálogo com fotografias de produtos

O catálogo de fotografias contém 21 peças: 12 itens de manutenção e nove peças cadastradas anteriormente pelas etiquetas da Marcon. As fotos foram obtidas nas páginas dos respectivos produtos, verificadas visualmente e salvas como WebP em `public/parts/`. A interface carrega os arquivos do próprio site. Cada peça tem um código/QR estável e a mesma imagem na lista, nos detalhes e na requisição.

`data/parts-catalog.json` registra códigos, especificações, URL da página de origem, crédito, arquivo original e data de verificação. As fotografias são referências visuais dos modelos de catálogo dos fornecedores, não fotografias do estoque físico da empresa. Os direitos continuam pertencendo aos titulares indicados; o arquivo não declara uma licença livre. A tela de detalhes inclui o link de crédito/origem.

## Aplicar no banco

```bash
npm run catalog:sync
```

O comando usa a `DATABASE_URL` do `.env`, valida os arquivos e importa os cadastros em uma transação. Pode ser executado novamente: mantém os mesmos códigos, não duplica peças e não altera saldos ou reservas existentes. Também preserva uma foto personalizada já cadastrada pelo usuário. As oito novas peças começam com saldo zero. Para disponibilizá-las para requisição, registre a entrada real no almoxarifado e sua posição pelo fluxo de estoque.

Em um banco novo, execute as migrações e configure os almoxarifados antes desse comando. Para publicar, envie também `data/parts-catalog.json` e `public/parts/` no deploy da Vercel. Se Production usar outro banco, execute o comando com a URL daquele banco. Não é necessário executar o seed de contas ou trocar senhas.

## Peças e origens

| Código       | Peça                              | Origem da fotografia                                                                                            |
| ------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ROL-6205-ZZ  | Rolamento 6205 ZZ                 | [ISK Bearings](https://iskbearing.com/product-details/6205zz)                                                   |
| PAR-M12-040  | Parafuso sextavado M12 × 40 mm    | [Metal Mate / Oneweld](https://oneweld.co.uk/m12-x-40mm-high-tensile-set-bolt-grade-10-9-grd-10-9-self-colour/) |
| COR-A42      | Correia industrial A-42           | [Vonder / Dutra](https://www.dutra.com.br/p/correia-em-v-a-42-66-97-104-200)                                    |
| RET-35527    | Retentor 35 × 52 × 7 mm           | [SAV / Corremol](https://www.corremol.com.br/retentor-35x52x7-lx-sav-7354-0/p/6481)                             |
| ROL-6201-ZZ  | Rolamento 6201 ZZ                 | [ISK Bearings](https://iskbearing.com/product-details/6201zz)                                                   |
| ROL-6202-ZZ  | Rolamento 6202 ZZ                 | [ISK Bearings](https://iskbearing.com/product-details/6202zz)                                                   |
| ROL-6203-ZZ  | Rolamento 6203 ZZ                 | [ISK Bearings](https://iskbearing.com/product-details/6203zz)                                                   |
| ROL-6204-ZZ  | Rolamento 6204 ZZ                 | [ISK Bearings](https://iskbearing.com/product-details/6204zz)                                                   |
| FER-CATR-13  | Chave combinada com catraca 13 mm | [Vonder / Dutra](https://www.dutramaquinas.com.br/p/chave-combinada-com-catraca-13-mm-36-06-300-013)            |
| FER-COMB-13  | Chave combinada 13 mm             | [Tramontina / Dutra](https://www.dutramaquinas.com.br/p/chave-combinada-de-13-mm-aco-especial-41128-113)        |
| FER-ALI-08   | Alicate universal 8 polegadas     | [Vonder / Dutra](https://www.dutramaquinas.com.br/p/alicate-universal-para-eletricista-8-36-62-100-008)         |
| ELE-FIT-1920 | Fita isolante preta 19 mm × 20 m  | [Tekbond / Dutra](https://www.dutramaquinas.com.br/p/fita-isolante-19-mm-x-20-metros-21131001920)               |

## Verificação

```bash
npm run build
npm run test:logistics -- --ui --embedded --catalog
```

O teste usa um schema temporário do Neon: verifica importação repetida, saldo zero, foto personalizada, API de listagem e detalhe, carregamento das 21 fotos no navegador, busca, filtro por disponibilidade e requisição de uma peça nova após entrada de estoque registrada. Os saldos de teste não são gravados no estoque da empresa.

## Peças das etiquetas e imagens de referência

As nove imagens abaixo são fotografias de catálogo de fornecedores. O modelo fotografado é identificado nos detalhes e todas as telas que exibem essas imagens apresentam a marca “Imagem de referência”. A foto não valida compatibilidade, material, dimensão ou disponibilidade do item cadastrado. Os nomes e especificações do estoque não foram substituídos por especificações de outro modelo. Os pneus aparecem montados nas rodas de catálogo.

| Código | Modelo fotografado | Origem e ressalva |
| --- | --- | --- |
| 129 | GLE 414 NPE | [Schioppa / Lojas Tamoyo](https://www.magazineluiza.com.br/rodizio-giratorio-espiga-4-preto-gle-414-npe-rolam-125kg-gle414npe-schioppa/p/ej7471h630/pi/rdzo/) — Rodízio giratório de 4 polegadas com espiga. A foto corresponde ao GLE 414 NPE anunciado pelo fornecedor; a variante NPN do cadastro não foi confirmada. |
| 120 | FLE 312 BP | [Schioppa / Lafonte](https://lafonteconstrucoes.com.br/produtos/rodizio-fle-312-bp/) — Rodízio fixo de 3 polegadas com espiga. A foto mostra a variante BP, com roda de PVC; a variante NPP do cadastro tem material diferente. |
| 127 | GLE 312 NPPE | [Schioppa / Dra da Borracha](https://dradaborracha.com.br/produtos/rodizio-schioppa-gle-312-nppe/) — Rodízio giratório de 3 polegadas com espiga. A foto mostra a variante NPPE com rolamento; o cadastro informa NPP. |
| 173 | GMG | [Marcon](https://www.marcon.ind.br/produto/referencia-gmg/) — Garfo giratório para rodas, sem roda montada. A foto mostra o Marcon GMG; as dimensões e a referência GQMS 3508 R do cadastro não foram confirmadas. |
| 7988 | GMG | [Marcon](https://www.marcon.ind.br/produto/referencia-gmg/) — Garfo giratório para rodas, sem roda montada. A foto mostra o Marcon GMG, de outra referência e dimensão; não corresponde ao GMX 62. |
| 1794 | RM-5A | [Marcon](https://www.marcon.ind.br/produto/referencia-rm-5a/) — Roda de borracha maciça de 8 polegadas. A foto mostra o pneu montado na roda Marcon RM-5A; não confirma o pneu avulso do código 1794. |
| 1795 | RM-5B | [Marcon](https://www.marcon.ind.br/produto/referencia-rm-5b/) — Roda de borracha maciça de 9 polegadas. A foto mostra o pneu montado na roda Marcon RM-5B; não confirma o pneu avulso do código 1795. |
| 1796 | RM-5C | [Marcon](https://www.marcon.ind.br/produto/referencia-rm-5c/) — Roda de borracha maciça de 10 polegadas. A foto mostra o pneu montado na roda Marcon RM-5C; não confirma o pneu avulso do código 1796. |
| 5746 | R 9200 BIN 7/8 | [Schioppa](https://marketplace.schioppa.com.br/roda-r-9200-bin-7-8/p) — Roda de borracha maciça de 9 polegadas. A foto mostra eixo de 7/8 polegada; o cadastro informa 3/4. Não usar a foto para confirmar compatibilidade. |

A peça **17940 — Guia de ferro fundido nº 06** permanece sem foto: a referência não identifica com segurança a forma ou o equipamento de origem. Para finalizar sua imagem, é necessário confirmar a referência completa ou fornecer uma fotografia da peça.
