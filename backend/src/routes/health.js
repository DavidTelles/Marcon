const express = require('express');
const healthRouter = express.Router();

const endpoints = [
  '/health',
  '/api-docs',
  '/register',
  '/login',
  '/login/rfid',
  '/forgot/password',
  '/forgot/password/reset',
  '/forgot/email',
  '/me',
  '/api/users',
  '/api/blocks',
  '/api/sectors',
  '/api/warehouses',
  '/api/products',
  '/api/stock',
  '/api/stock/movements',
  '/api/requests',
  '/api/rfid',
  '/api/workspace/snapshot',
  '/api/workspace/transfers',
  '/api/workspace/actions',
  '/admin/dashboard',
  '/warehouse/dashboard',
  '/department-head/dashboard'
];

const payloads = [
  ['login', { login: 'matrícula ou e-mail', password: 'senha' }],
  ['login/rfid', { rfid_id: 'AABBCCDDEE' }],
  [
    'createEmployee',
    { id: 'matrícula', password: 'senha', name: 'nome', block: 'Bloco A', sector: 'Usinagem', role: 'funcionario' }
  ],
  [
    'addItem',
    { sku: 'COD-PECA', name: 'nome', amount: 10, warehouse_id: 1 }
  ],
  [
    'requestItem',
    { product_id: 1, quantity: 2, urgency: 'Leve', description: 'justificativa' }
  ],
  [
    'workspaceAction',
    { type: 'createRequests', entries: [{ code: 'ROL-6205-ZZ', quantity: 2, priority: 'Leve' }] }
  ]
];

healthRouter.get('/', (req, res) => {
  res.status(200).json({
    message: 'MARCON API (backend integrado) em execução',
    endpoints,
    payloads
  });
});

module.exports = healthRouter;
