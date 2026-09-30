# Login Marcon

Execute `npm ci` e `npm run dev`, depois acesse http://localhost:3000/login.

Contas exclusivamente de demonstração, todas com senha `Marcon@123`:

| Perfil | E-mail | Matrícula |
| --- | --- | --- |
| Funcionário | ana@marcon.demo | 1001 |
| Líder de bloco | carlos@marcon.demo | 1002 |
| Almoxarifado | mariana@marcon.demo | 1003 |
| Admin | rafael@marcon.demo | 1004 |

O RFID simulado aguarda 5 segundos e identifica automaticamente Ana Souza, sem senha, pelo endpoint dedicado /api/login/rfid. É possível cancelar durante a espera. Falhas exibem opção de tentar novamente. Não acessa hardware. O login comum continua exigindo senha. Ambos criam cookie HttpOnly de 8 horas e encaminham para /inicio/[perfil]. As páginas verificam sessão e perfil no servidor. Sair remove o cookie.

Para produção, substituir as contas demonstrativas pelo serviço corporativo de autenticação, com senhas protegidas, controle de tentativas e revogação de sessões. Configurar SESSION_SECRET com um segredo aleatório privado e estável, compartilhado entre instâncias. Sem essa variável, o segredo é temporário e sessões expiram ao reiniciar o processo. As páginas iniciais são boas-vindas por perfil; módulos de estoque, requisições e gestão não fazem parte desta entrega.

Paleta baseada no documento de identidade visual fornecido. O nome da empresa aparece como texto de identificação; a logo fornecida está em public/image.png. Não foram fornecidos binário Inter: a interface usa fallback Arial, sem solicitar fontes externas.

Validação: `npm run lint`, `npm run build`. Com o servidor ativo, executar `node scripts/check-auth.mjs`.

Verificação visual manual: 320, 375, 640, 768, 1024, 1280 e 1920 px; zoom 200%; navegação por Tab; senha incorreta; mostrar/ocultar senha; RFID seguido de cancelar e confirmar; sair e tentar acessar uma página inicial.

## Interface e manutenção

- Layout e conteúdo institucional são Server Components. Somente o formulário e o efeito de inclinação são Client Components.
- `app/login/use-login.ts` concentra o login por credenciais, bloqueio de envio repetido e tempo limite. `components/rfid-access.tsx` controla a espera, o cancelamento e a nova tentativa da leitura simulada.
- `app/login/login.module.css` isola os estilos da tela; tokens e estilos compartilhados ficam no CSS global.
- Cena 3D em CSS: camadas com perspectiva, entrada e reflexo de duração finita, inclinação via ponteiro com requestAnimationFrame e limpeza de eventos ao desmontar.
- A composição 3D fica oculta abaixo de 900 px. Movimento reduzido desativa animações e inclinação. Nenhuma biblioteca 3D ou de animação é carregada.
- Ícones e origem dos assets estão registrados em ASSETS.md.

Testes de navegador: `npm run test:e2e`. Na primeira execução, instalar Chromium com `npx playwright install chromium`. Também é possível usar um Chrome já instalado definindo `PLAYWRIGHT_CHANNEL=chrome`.

Os testes cobrem sete larguras, fluxo comum, erros, RFID sem senha com espera, cancelamento e nova tentativa, foco, saída, falha de rede, inclinação 3D e preferência por movimento reduzido. Capturas desktop e celular ficam em `test-results/`.

A rota `/api/login/rfid` autentica exclusivamente a conta demonstrativa fixa. Para conectar um leitor físico, substituir essa simulação por validação da leitura e associação do cartão ao usuário no servidor; o temporizador da interface não valida cartões reais.
