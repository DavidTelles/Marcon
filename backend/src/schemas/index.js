const { z } = require('zod');


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
    requests: z.any().optional()
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
    code: z.string().min(1).max(64).optional(),
    requestKey: z.string().regex(/^[\w-]{16,64}$/).optional(),
    qr_code: z.string().min(1).max(128).optional(),
    unit: z.string().min(1).max(24).optional(),
    category: z.string().min(1).max(80).optional(),
    location: z.string().min(1).max(80).optional(),
    pack_size: z.coerce.number().int().positive().optional(),
    lead_days: z.coerce.number().int().positive().optional(),
    reference_unit_price: z.coerce.number().nonnegative().optional(),
    capacity: z.coerce.number().int().positive().nullable().optional(),
    map_node_id: z.string().max(64).nullable().optional(),
    local_minimum: z.coerce.number().int().nonnegative().optional(),
    reason: z.string().optional(),
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
    requestedUnit: z.enum(['piece', 'box']).optional(),
    id: z.any().optional(),
    requestKey: z.string().regex(/^[\w-]{16,64}$/).optional(),
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
      requestedUnit: z.enum(['piece', 'box']).optional(),
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
    notes: z.string().optional(),
    requestKey: z.string().regex(/^[\w-]{16,64}$/),
    request_id: z.coerce.number().int().positive().optional(),
    qr_code: z.string().min(1).max(128).optional(),
    confirmation: z.string().uuid().optional()
  })
});
const pickupFields = {
  qr_code: z.string().min(1).max(128),
  confirmed_quantity: z.coerce.number().int().positive().max(1000000000),
  requestKey: z.string().regex(/^[\w-]{16,64}$/)
};
const preparePickupBody = z.object({ body: z.object(pickupFields) });
const confirmPickupBody = z.object({ body: z.object({ ...pickupFields, confirmation: z.string().uuid() }) });

module.exports = {
  registerBody,
  loginBody,
  idParam,
  addItemBody,
  requestBody,
  movementBody,
  preparePickupBody,
  confirmPickupBody
};
