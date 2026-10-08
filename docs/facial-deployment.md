# Cadastro e login facial hospedados

O cadastro e o login facial usam os modelos YuNet/SFace de `face/models/` na
própria função Node do Next/Vercel, com ONNX Runtime em CPU e Sharp. Não exigem
Python, segundo projeto ou variáveis `FACE_SERVICE_URL`/`FACE_SERVICE_TOKEN`.
Preservam o modelo, vetores de 128 dimensões, limiar 0,363 e dados criptografados.

## Publicação

Configure `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET` e `BACKEND_URL=embedded`
no projeto Vercel. Essas configurações gerais continuam necessárias; o arquivo
`.env` local não configura automaticamente a hospedagem. Não altere
`SESSION_SECRET`: ele também protege os cadastros faciais existentes.

`vercel.json` instala somente CPU e reserva até 60 segundos para a API.
`next.config.ts` inclui os modelos e binários Linux x64 na rota facial, excluindo
outras plataformas e bibliotecas GPU. Os modelos são carregados uma vez por
instância. Câmeras com outras proporções são enquadradas sem distorção e os
pontos faciais voltam às coordenadas originais antes do alinhamento SFace.

O motor padrão é `node`, mesmo se houver configurações antigas `FACE_SERVICE_*`.
Somente `FACE_ENGINE=remote` seleciona o serviço Python separado. Um endereço
antigo ou incompleto não impede o motor padrão de funcionar.

## Uso e validação

Entre com senha e abra **Editar perfil → Reconhecimento facial**. Confirme
novamente a senha e o consentimento antes de permitir a câmera. Siga as posições,
saia e teste o acesso facial com a mesma conta e senha. A câmera exige HTTPS e
permissão no navegador. Capturas sem rosto, com vários rostos, rosto distante,
posição divergente ou quadros repetidos são recusadas.

As fotos não são gravadas pelo código da aplicação; apenas os vetores são
guardados criptografados no Neon. Cadastros anteriores a `server-face-v2` exigem
novo cadastro e consentimento. Cadastros compatíveis são preservados. Trocar o
segredo de sessão exige recadastro. A senha permanece obrigatória: resistência
a fotos e vídeos não foi validada com pessoas autorizadas e câmera física.

```bash
npm run check:face
npm run check:hosting -- --url https://marcon-ten.vercel.app --face
npm run test:face:node
npm run build
node scripts/test-integrated-logistics.mjs --ui --embedded --face-node
node scripts/test-integrated-logistics.mjs --ui --embedded --face
```

`check:face` carrega os modelos e executa uma inferência CPU de aquecimento.
O endpoint `/api/login/face?health=1` confirma essa inferência na hospedagem e
retorna somente disponibilidade, modelo e dimensões, sem dados de usuários.
`test:face:node` faz inferência real e testa capturas válidas, enquadramento
640×480, poses e recusas. Para comparar com o protótipo OpenCV, instale o
ambiente Python opcional e execute `npm run test:face:node -- --compare-python`.

`--face-node` testa as rotas do build de produção com `VERCEL=1`, sem serviço
facial externo ou Python: cadastro criptografado, cinco posições solicitadas,
login dos quatro perfis, ambas as sessões, senha incorreta, recusa de repetição
do desafio e exclusão. Usa imagens sintéticas com perspectiva. `--face` usa
câmera e provedor controlados para testar a interface, senha antes da câmera,
interrupção, nova tentativa e redirecionamento. Ambos usam schema Neon temporário
e removem apenas esse schema ao terminar. Não alteram contas públicas e não
comprovam identidade ou resistência a fotos/vídeos no domínio publicado.

## Motores opcionais

Para Python local, prepare `face/.venv`, instale `face/requirements-dev.txt` e
selecione `FACE_ENGINE=python`; `FACE_PYTHON` pode escolher outro interpretador.
Esse motor local não é aceito na Vercel.

Para o serviço separado, publique `face/` como FastAPI e configure
`FACE_SERVICE_TOKEN` aleatório de pelo menos 32 caracteres nesse serviço.
No Next, selecione `FACE_ENGINE=remote`, `FACE_SERVICE_URL` HTTPS e o mesmo token.
`FACE_SERVICE_BYPASS_SECRET` é opcional se a proteção de deployment exigir bypass.
Todas essas variáveis são de servidor, sem `NEXT_PUBLIC_`. O serviço exige token
também no `/health`. `npm run check:face` verifica a conexão nesse modo.
