# Etiquetas de peças

A foto original fornecida em 07/10/2026 está em `tests/fixtures/qr/printed-labels.png`.
SHA-256: `cc973f6dd74ad9779e4e55b77018acd157aa05c3533dab4b96fb816e3a1b36f2`.
Os conteúdos foram decodificados dos pixels dos QR Codes. Os números impressos ao lado
não foram usados como substitutos de uma leitura.

| ID impresso e cadastrado | Conteúdo do QR |
| --- | --- |
| 129 | `129\r\n` |
| 120 | `128\r\n` |
| 127 | `127\r\n` |
| 173 | `173\r\n` |
| 7988 | `7988\r\n` |
| 17940 | `17940\r\n` |
| 1794 | `1794\r\n` |
| 1796 | `1796\r\n` |
| 1795 | `1795\r\n` |
| 5746 | `5746\r\n` |

O QR 128 foi associado à peça 120 em `data/parts-catalog.json`. `npm run catalog:sync`
aplica o vínculo, rejeita colisões e preserva saldos, reservas e códigos personalizados.
Consultar pelo ID 120 ou ler o QR 128 retorna a mesma peça. As novas etiquetas geradas
usam o QR cadastrado. A API remove apenas os terminadores CR/LF para comparar com
identificadores cadastrados; não interpreta URLs, descrições ou números dentro de textos.

Fotos com várias etiquetas apresentam as peças resolvidas pelo servidor para escolha.
A leitura de imagem prioriza QR Codes e trata impressão com pouco contraste. A leitura
na entrega só aceita a peça da requisição. Ler ou pesquisar não movimenta estoque;
a baixa continua dependendo da confirmação e da quantidade correta.

Validação: `npm run test:qr:labels` decodifica os dez recortes originais em quatro
orientações e a folha inteira. `npm run test:qr` cobre interface, câmera com fluxo de
vídeo controlado, permissões, seleção da folha e entrega usando o QR original da peça
120. O fluxo de vídeo testa o decodificador e a liberação da câmera, mas a câmera física
de cada celular precisa ser validada no dispositivo, com HTTPS e permissão concedida.
