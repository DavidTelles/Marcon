# Cadastro e login facial hospedados

O projeto Next.js executa o backend e acessa o Neon com `BACKEND_URL=embedded`. A extração facial usa Python e OpenCV; para hospedá-la, publique a pasta `face/` como um segundo projeto da Vercel, no mesmo repositório. O navegador envia a captura ao Next, que chama esse serviço autenticado. O serviço Python devolve vetores e não acessa o banco nem cria sessões.

## Configurar os dois projetos

Primeiro, confirme o projeto principal com `npm run check:hosting -- --url https://marcon-ten.vercel.app`. O resultado esperado é HTTP 200 e banco/backend conectados. Configure `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET` e `BACKEND_URL=embedded` no painel e faça o deploy deste código. O arquivo `.env` local não configura automaticamente a Vercel.

Crie o projeto facial a partir do mesmo repositório:

1. Se o repositório começar em `Marcon/package.json`, use **Root Directory = face**. Se ele contiver uma pasta `Marcon/`, use **Marcon/face**.
2. Use o framework **FastAPI**. A pasta contém `app.py`, `requirements.txt`, `.python-version`, `vercel.json` e os dois modelos em `models/`; preserve todos no deploy. Não copie o build command Next.js para esse projeto.
3. Configure `FACE_SERVICE_TOKEN` com o token aleatório de pelo menos 32 caracteres do `.env` local. Esse serviço não precisa de `DATABASE_URL`, `JWT_SECRET` ou `SESSION_SECRET`.
4. Publique e copie a URL HTTPS de produção do projeto facial.

No projeto principal, configure e faça outro deploy:

| Variável                     | Valor                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `FACE_SERVICE_URL`           | URL HTTPS base do projeto facial, sem `/health` ou `/extract`                                                       |
| `FACE_SERVICE_TOKEN`         | Exatamente o mesmo token do projeto facial                                                                          |
| `FACE_SERVICE_BYPASS_SECRET` | Somente se Deployment Protection bloquear a chamada entre projetos: segredo de bypass configurado no projeto facial |

Mantenha essas variáveis apenas no servidor, sem `NEXT_PUBLIC_`. O token continua obrigatório mesmo quando a proteção de deployment permitir o acesso. Não defina `FACE_PYTHON` no Next hospedado; essa opção escolhe o interpretador apenas no desenvolvimento local.

## Verificar o deploy

Configure também a URL e o token no `.env` local e execute:

```bash
npm run check:face
npm run check:hosting -- --url https://marcon-ten.vercel.app
```

`check:face` faz uma chamada autenticada ao `/health` do Python, carrega os modelos reais e verifica o identificador do modelo e suas 128 dimensões. Não imprime credenciais. Uma consulta sem token a esse endpoint retorna 401.

No site publicado, entre com senha, abra o perfil e faça o cadastro facial com a câmera. Depois, saia e teste o login facial com a mesma conta. O login facial também exige a senha. O Next verifica o desafio, compara os vetores e cria tanto a sessão da interface quanto o token do backend. Confirme acesso ao painel e às operações após o login.

Cadastros anteriores à política `server-face-v2` precisam de novo cadastro para registrar o consentimento de processamento no serviço. As fotografias não são gravadas pelo código da aplicação; os vetores são criptografados no Neon com chave derivada de `SESSION_SECRET`. Alterar esse segredo exige novo cadastro facial.

## Testes disponíveis e alcance

```bash
npm run test:hosting
npm run test:logistics -- --ui --embedded
npm run test:logistics -- --ui --embedded --face
python -m pip install -r face/requirements-dev.txt
python scripts/test-face-python.py
python face/tests/test_service.py
npm run test:face:http
```

Use o interpretador configurado em `FACE_PYTHON` no lugar de `python`, se necessário. Os testes de integração criam e removem apenas um schema temporário, sem alterar registros existentes no schema público. Faça `npm run build` antes dos testes que usam `--ui`.

Os testes verificam conexão Neon por HTTP, transações, login, operações, cadastro facial, vetores criptografados, emissão das duas sessões, recusa de vetor divergente, exclusão e desafio de uso único. O teste de fluxo facial usa um provedor controlado e câmera simulada no navegador, incluindo o redirecionamento ao painel; os testes Python e HTTP usam os modelos reais e uma imagem sintética. Isso não substitui a validação com pessoas autorizadas e câmera real no domínio publicado. A resistência a fotos e vídeos ainda não foi validada; por esse motivo, a senha permanece obrigatória.
