CREATE TABLE stock_recommendations (
  key char(64) PRIMARY KEY,
  part_id bigint NOT NULL REFERENCES parts(id),
  source_warehouse_id bigint NOT NULL REFERENCES warehouses(id),
  destination_warehouse_id bigint NOT NULL REFERENCES warehouses(id),
  quantity integer NOT NULL CHECK(quantity > 0),
  map_version_id bigint NOT NULL REFERENCES map_versions(id),
  part_updated_at timestamp(3) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'Pendente' CHECK(status IN ('Pendente','Aceita','Rejeitada')),
  created_at timestamp(3) NOT NULL DEFAULT now(),
  decided_at timestamp(3),
  decided_by bigint REFERENCES users(id),
  transfer_id bigint REFERENCES stock_transfers(id)
);
--> statement-breakpoint
CREATE INDEX idx_stock_recommendations_part ON stock_recommendations(part_id,status);
