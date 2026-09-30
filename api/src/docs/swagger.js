const swaggerUi = require('swagger-ui-express');

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'MARCON Backend API',
    version: '2.0.0',
    description:
      'API REST integrada MARCON: almoxarifado, requisições, usuários, RFID e a camada de workspace consumida pelo frontend (banco unificado).'
  },
  servers: [{ url: '/', description: 'Servidor atual' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string' },
          details: {}
        }
      },
      LoginRequest: {
        type: 'object',
        required: ['password'],
        properties: {
          login: { type: 'string', example: 'ADM001' },
          email: { type: 'string' },
          id: { type: 'string' },
          password: { type: 'string', example: 'Admin@12345' }
        }
      },
      RegisterRequest: {
        type: 'object',
        required: ['password'],
        properties: {
          id: { type: 'string', example: 'FUN001' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string' },
          email: { type: 'string' },
          block_id: { type: 'integer' },
          sector_id: { type: 'integer' },
          rfid_id: { type: 'string', example: 'A1B2C3D4' }
        }
      },
      RfidIngest: {
        type: 'object',
        properties: {
          rfid_id: { type: 'string', example: 'AABBCCDDEE', description: 'UID hexadecimal 8-20 caracteres' },
          location: { type: 'string' },
          device: { type: 'string' },
          query_external: { type: 'boolean' }
        }
      },
      RequestCreate: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          urgency: { type: 'string', enum: ['LEVE', 'MODERADO', 'URGENTE'] },
          sector_id: { type: 'integer' },
          block_id: { type: 'integer' },
          warehouse_id: { type: 'integer' },
          id_item: { type: 'integer' },
          amount: { type: 'integer' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'integer' },
                quantity: { type: 'integer' }
              }
            }
          }
        }
      },
      Movement: {
        type: 'object',
        required: ['product_id', 'warehouse_id', 'quantity'],
        properties: {
          product_id: { type: 'integer' },
          warehouse_id: { type: 'integer' },
          warehouse_to_id: { type: 'integer' },
          quantity: { type: 'integer' },
          notes: { type: 'string' }
        }
      }
    }
  },
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'RFID' },
    { name: 'Usuários' },
    { name: 'Catálogo' },
    { name: 'Estoque' },
    { name: 'Requisições' },
    { name: 'Dashboards' }
  ],
  paths: {
    '/login/rfid': {
      post: {
        tags: ['Auth'],
        summary: 'Login por crachá RFID',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { rfid_id: { type: 'string', example: 'AABBCCDDEE' } } } } }
        },
        responses: { '200': { description: 'Token JWT e usuário' }, '401': { description: 'Crachá não reconhecido' } }
      }
    },
    '/api/workspace/snapshot': {
      get: {
        tags: ['Workspace'],
        summary: 'Snapshot completo do workspace (consumido pelo frontend)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'catalogOnly', in: 'query', schema: { type: 'string', enum: ['1', 'true'] } }],
        responses: { '200': { description: 'Estoque, saldos, requisições, movimentações, devoluções, transferências e equipe' } }
      }
    },
    '/api/workspace/transfers': {
      get: {
        tags: ['Workspace'],
        summary: 'Transferências entre almoxarifados (paginado)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Lista de transferências' }, '403': { description: 'Perfil sem permissão' } }
      }
    },
    '/api/workspace/actions': {
      post: {
        tags: ['Workspace'],
        summary: 'Executa ação de negócio (createRequests, changeRequestStatus, transfer, savePart, ...)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { type: { type: 'string', example: 'createRequests' } }, required: ['type'] } } }
        },
        responses: { '200': { description: 'Resultado da ação' }, '400': { description: 'Ação inválida' }, '409': { description: 'Conflito de saldo/dados' } }
      }
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Status do servidor e contratos de referência',
        responses: { 200: { description: 'Servidor em execução' } }
      }
    },
    '/register': {
      post: {
        tags: ['Auth'],
        summary: 'Registro de funcionário (papel EMPLOYEE)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } } },
        responses: { 201: { description: 'Criado' }, 409: { description: 'Conflito' }, 400: { description: 'Validação' } }
      }
    },
    '/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login JWT',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: {
          200: { description: 'Token emitido' },
          401: { description: 'Credenciais inválidas' },
          403: { description: 'Usuário inativo' }
        }
      }
    },
    '/forgot/password': {
      post: {
        tags: ['Auth'],
        summary: 'Solicitar redefinição de senha',
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { email: { type: 'string' }, employee_code: { type: 'string' } } }
            }
          }
        },
        responses: { 200: { description: 'Token gerado (exceto em produção)' } }
      }
    },
    '/forgot/password/reset': {
      post: {
        tags: ['Auth'],
        summary: 'Redefinir senha com token',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: { token: { type: 'string' }, password: { type: 'string' } }
              }
            }
          }
        },
        responses: { 200: { description: 'Senha atualizada' }, 400: { description: 'Token inválido' } }
      }
    },
    '/forgot/email': {
      post: {
        tags: ['Auth'],
        summary: 'Recuperar dica de e-mail pelo código do funcionário',
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { employee_code: { type: 'string' }, id: { type: 'string' } } }
            }
          }
        },
        responses: { 200: { description: 'Dica de e-mail' }, 404: { description: 'Usuário inexistente' } }
      }
    },
    '/me': {
      get: {
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        summary: 'Usuário autenticado',
        responses: { 200: { description: 'Perfil' }, 401: { description: 'Não autenticado' } }
      }
    },
    '/api/rfid': {
      post: {
        tags: ['RFID'],
        summary: 'Sensor RFID envia UID do crachá para decisão de acesso',
        description:
          'Fluxo: crachá → sensor → /api/rfid → identificação do funcionário → verificação de ativo/permissão → registro do evento.',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/RfidIngest' } } } },
        responses: {
          201: { description: 'Acesso permitido' },
          200: { description: 'Acesso negado (evento registrado)' },
          400: { description: 'RFID inválido' },
          502: { description: 'API RFID indisponível' },
          504: { description: 'Timeout da API RFID' }
        }
      },
      get: {
        tags: ['RFID'],
        security: [{ bearerAuth: [] }],
        summary: 'Histórico de eventos de acesso RFID',
        responses: { 200: { description: 'Lista de leituras/eventos' }, 401: { description: 'Não autenticado' }, 403: { description: 'Sem permissão' } }
      }
    },
    '/api/users': {
      get: {
        tags: ['Usuários'],
        security: [{ bearerAuth: [] }],
        summary: 'Listar usuários (admin)',
        responses: { 200: { description: 'Lista' }, 403: { description: 'Proibido' } }
      }
    },
    '/api/users/{id}': {
      get: {
        tags: ['Usuários'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Usuário' }, 404: { description: 'Não encontrado' } }
      },
      patch: {
        tags: ['Usuários'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Atualizado' } }
      }
    },
    '/api/users/{id}/permissions': {
      patch: {
        tags: ['Usuários'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { permission: { type: 'string' }, allowed: { type: 'boolean' } }
              }
            }
          }
        },
        responses: { 200: { description: 'Permissões atualizadas' } }
      }
    },
    '/admin/create': {
      post: {
        tags: ['Usuários'],
        security: [{ bearerAuth: [] }],
        summary: 'Admin cria usuário de qualquer papel',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } } },
        responses: { 201: { description: 'Criado' }, 403: { description: 'Proibido' } }
      }
    },
    '/api/blocks': {
      get: { tags: ['Catálogo'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Blocos' } } },
      post: { tags: ['Catálogo'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Criado' } } }
    },
    '/api/blocks/{id}': {
      patch: {
        tags: ['Catálogo'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Atualizado' } }
      }
    },
    '/api/sectors': {
      get: { tags: ['Catálogo'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Setores' } } },
      post: { tags: ['Catálogo'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Criado' } } }
    },
    '/api/sectors/{id}': {
      patch: {
        tags: ['Catálogo'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Atualizado' } }
      }
    },
    '/api/warehouses': {
      get: {
        tags: ['Catálogo'],
        security: [{ bearerAuth: [] }],
        summary: '1 central + auxiliares',
        responses: { 200: { description: 'Almoxarifados' } }
      },
      post: { tags: ['Catálogo'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Criado' } } }
    },
    '/api/warehouses/{id}': {
      patch: {
        tags: ['Catálogo'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Atualizado' } }
      }
    },
    '/api/products': {
      get: { tags: ['Catálogo'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Peças' } } },
      post: {
        tags: ['Catálogo'],
        security: [{ bearerAuth: [] }],
        summary: 'Criar peça (contrato addItem: id, name, amount)',
        responses: { 201: { description: 'Criado' } }
      }
    },
    '/api/products/{id}': {
      get: {
        tags: ['Catálogo'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Peça' }, 404: { description: 'Não encontrada' } }
      },
      patch: {
        tags: ['Catálogo'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Atualizado' } }
      }
    },
    '/api/products/{id}/location': {
      get: {
        tags: ['Catálogo'],
        security: [{ bearerAuth: [] }],
        summary: 'Onde a peça está disponível em cada almoxarifado',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Localizações' } }
      }
    },
    '/api/stock': {
      get: {
        tags: ['Estoque'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'warehouse_id', in: 'query', schema: { type: 'integer' } },
          { name: 'product_id', in: 'query', schema: { type: 'integer' } }
        ],
        responses: { 200: { description: 'Estoque por almoxarifado' } }
      }
    },
    '/api/stock/movements': {
      get: { tags: ['Estoque'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Histórico de movimentações' } } }
    },
    '/api/stock/in': {
      post: {
        tags: ['Estoque'],
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Movement' } } } },
        responses: { 201: { description: 'Entrada registrada' }, 409: { description: 'Conflito' } }
      }
    },
    '/api/stock/out': {
      post: {
        tags: ['Estoque'],
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Movement' } } } },
        responses: { 201: { description: 'Saída registrada' }, 409: { description: 'Quantidade insuficiente' } }
      }
    },
    '/api/stock/transfer': {
      post: {
        tags: ['Estoque'],
        security: [{ bearerAuth: [] }],
        summary: 'Transferência entre almoxarifados (auxiliares podem abastecer o central)',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Movement' } } } },
        responses: { 201: { description: 'Transferência registrada' }, 409: { description: 'Quantidade insuficiente' } }
      }
    },
    '/api/stock/location/{id}': {
      get: {
        tags: ['Estoque'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Localização da peça' } }
      }
    },
    '/api/requests': {
      get: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        summary: 'Lista filtrada conforme o papel',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string' } },
          { name: 'to', in: 'query', schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Lista' } }
      },
      post: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/RequestCreate' } } } },
        responses: { 201: { description: 'Criada' } }
      }
    },
    '/api/requests/{id}': {
      get: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detalhe' }, 404: { description: 'Não encontrada' } }
      },
      patch: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        summary: 'Editar quantidade antes da aprovação',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Atualizada' }, 409: { description: 'Estado não permite edição' } }
      },
      delete: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        summary: 'Excluir antes da aprovação',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Excluída' }, 409: { description: 'Estado não permite exclusão' } }
      }
    },
    '/api/requests/{id}/analyze': {
      post: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Em análise' }, 403: { description: 'Sem autorização' } }
      }
    },
    '/api/requests/{id}/approve': {
      post: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Aprovada' } }
      }
    },
    '/api/requests/{id}/reject': {
      post: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Rejeitada' } }
      }
    },
    '/api/requests/{id}/separate': {
      post: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        summary: 'Almoxarife separa itens e baixa estoque',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { warehouse_id: { type: 'integer' }, notes: { type: 'string' } } }
            }
          }
        },
        responses: { 200: { description: 'Separando' }, 409: { description: 'Estoque insuficiente' } }
      }
    },
    '/api/requests/{id}/deliver': {
      post: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Entregue' } }
      }
    },
    '/api/requests/{id}/receive': {
      post: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        summary: 'Confirmar entrega (fluxo semelhante ao iFood)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Recebida' } }
      }
    },
    '/api/requests/{id}/cancel': {
      post: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Cancelada' }, 409: { description: 'Já entregue' } }
      }
    },
    '/api/requests/{id}/return': {
      post: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Devolução registrada' } }
      }
    },
    '/employee/request': {
      post: { tags: ['Requisições'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Criada' } } }
    },
    '/employee/history': {
      get: { tags: ['Requisições'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Histórico do funcionário' } } }
    },
    '/department-head/requests': {
      get: {
        tags: ['Requisições'],
        security: [{ bearerAuth: [] }],
        summary: 'Representante vê apenas o próprio setor',
        responses: { 200: { description: 'Lista do setor' } }
      }
    },
    '/warehouse/requests': {
      get: { tags: ['Requisições'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Fila do almoxarife' } } }
    },
    '/admin/all-requests': {
      get: { tags: ['Requisições'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Todas as requisições' } } }
    },
    '/admin/dashboard': {
      get: { tags: ['Dashboards'], security: [{ bearerAuth: [] }], summary: 'Estoque, requisições, peças e quantidades', responses: { 200: { description: 'Dashboard geral' } } }
    },
    '/admin/dashboard/warehouse': {
      get: { tags: ['Dashboards'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Por almoxarifado' } } }
    },
    '/admin/dashboard/stock': {
      get: { tags: ['Dashboards'], security: [{ bearerAuth: [] }], summary: 'Comparativo consumidas vs chegadas', responses: { 200: { description: 'Comparativo' } } }
    },
    '/admin/dashboard/block': {
      get: { tags: ['Dashboards'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Por bloco' } } }
    },
    '/admin/dashboard/sector/{id}': {
      get: {
        tags: ['Dashboards'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Por setor' } }
      }
    },
    '/admin/history/export': {
      get: {
        tags: ['Dashboards'],
        security: [{ bearerAuth: [] }],
        summary: 'Exportar relatório PDF',
        responses: { 200: { description: 'application/pdf' } }
      }
    },
    '/warehouse/dashboard': {
      get: { tags: ['Dashboards'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Dashboard do almoxarife' } } }
    },
    '/department-head/dashboard': {
      get: { tags: ['Dashboards'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Dashboard do representante' } } }
    }
  }
};

function setupSwagger(app) {
  app.get('/api-docs.json', (req, res) => res.json(spec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
}

module.exports = { spec, setupSwagger };
