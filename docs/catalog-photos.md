# Catálogo com fotografias de produtos

O catálogo compartilhado no Neon tem 12 peças: os quatro itens existentes e oito novos itens de manutenção. As fotos foram obtidas nas páginas dos respectivos produtos, verificadas visualmente e salvas como WebP em `public/parts/`. A interface carrega os arquivos do próprio site. Cada peça tem um código/QR estável e a mesma imagem na lista, nos detalhes e na requisição.

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

O teste usa um schema temporário do Neon: verifica importação repetida, saldo zero, foto personalizada, API de listagem e detalhe, carregamento das 12 fotos no navegador, busca, filtro por disponibilidade e requisição de uma peça nova após entrada de estoque registrada. Os saldos de teste não são gravados no estoque da empresa.
