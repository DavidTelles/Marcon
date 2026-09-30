const { z } = require('zod');

const rfidBody = z.object({
  body: z.object({
    rfid_id: z.string().regex(/^[0-9A-Fa-f]{8,20}$/).optional(),
    location: z.string().max(120).optional(),
    device: z.string().max(120).optional(),
    query_external: z.boolean().optional()
  }).optional().default({})
});

const registerBody = z.object({
  body: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    employee_code: z.string().min(1).optional(),
    password: z.string().min(8),
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    block: z.string().optional(),
    sector: z.string().optional(),
    block_id: z.coerce.number().int().positive().optional(),
    sector_id: z.coerce.number().int().positive().optional(),
    role: z.enum(['ADMIN', 'SECTOR_REPRESENTATIVE', 'WAREHOUSE_KEEPER', 'EMPLOYEE', 'admin', 'lider', 'almoxarifado', 'funcionario']).optional(),
    rfid_id: z.string().regex(/^[0-9A-Fa-f]{8,20}$/).optional(),
    requests: z.any().optional()
  })
});

const rfidLoginBody = z.object({
  body: z.object({
    rfid_id: z.string().regex(/^[0-9A-Fa-f]{8,20}$/).optional(),
    tag: z.string().regex(/^[0-9A-Fa-f]{8,20}$/).optional()
  })
});

const loginBody = z.object({
  body: z.object({
    login: z.string().min(1).optional(),
    email: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    password: z.string().min(1)
  })
});

const idParam = z.object({
  params: z.object({ id: z.coerce.number().int().positive() })
});

const addItemBody = z.object({
  body: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    sku: z.string().min(1).optional(),
    name: z.string().min(1),
    amount: z.coerce.number().int().nonnegative().optional(),
    quantity: z.coerce.number().int().nonnegative().optional(),
    warehouse_id: z.coerce.number().int().positive().optional(),
    description: z.string().optional(),
    min_quantity: z.coerce.number().int().nonnegative().optional(),
    corridor: z.string().optional(),
    shelf: z.string().optional()
  })
});

const requestBody = z.object({
  body: z.object({
    id: z.any().optional(),
    id_item: z.coerce.number().int().positive().optional(),
    id_employee: z.coerce.number().int().positive().optional(),
    product_id: z.coerce.number().int().positive().optional(),
    description: z.string().optional(),
    block: z.string().optional(),
    sector: z.string().optional(),
    block_id: z.coerce.number().int().positive().optional(),
    sector_id: z.coerce.number().int().positive().optional(),
    warehouse_id: z.coerce.number().int().positive().optional(),
    amount: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().int().positive().optional(),
    urgency: z.enum(['LEVE', 'MODERADO', 'URGENTE']).optional(),
    items: z.array(z.object({
      product_id: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().positive()
    })).optional()
  })
});

const movementBody = z.object({
  body: z.object({
    product_id: z.coerce.number().int().positive(),
    warehouse_id: z.coerce.number().int().positive(),
    warehouse_to_id: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().int().positive(),
    notes: z.string().optional()
  })
});

module.exports = {
  rfidBody,
  rfidLoginBody,
  registerBody,
  loginBody,
  idParam,
  addItemBody,
  requestBody,
  movementBody
};
