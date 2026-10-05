CREATE TABLE face_login_grants (
  token_hash bytea PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  password_hash varchar(190) NOT NULL,
  credential_hash varchar(64) NOT NULL,
  expires_at timestamp(3) NOT NULL,
  created_at timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_face_login_grants_expiry ON face_login_grants(expires_at);
--> statement-breakpoint
CREATE TABLE branches (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code varchar(64) NOT NULL UNIQUE,
  name varchar(160)
);
--> statement-breakpoint
ALTER TABLE blocks ADD COLUMN branch_id bigint REFERENCES branches(id);
ALTER TABLE warehouses ADD COLUMN branch_id bigint REFERENCES branches(id);
--> statement-breakpoint
CREATE TABLE sectors (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code varchar(64) NOT NULL,
  name varchar(160) NOT NULL,
  branch_id bigint NOT NULL REFERENCES branches(id),
  block_id bigint NOT NULL REFERENCES blocks(id),
  UNIQUE(branch_id,block_id,code), UNIQUE(id,branch_id,block_id)
);
--> statement-breakpoint
CREATE TABLE plant_points (
  id varchar(64) PRIMARY KEY,
  label varchar(120) NOT NULL,
  kind varchar(40) NOT NULL,
  warehouse_id bigint REFERENCES warehouses(id),
  block_id bigint REFERENCES blocks(id),
  sector_id bigint REFERENCES sectors(id),
  published_version_id bigint REFERENCES map_versions(id),
  active smallint NOT NULL DEFAULT 0 CHECK(active IN (0,1))
);
--> statement-breakpoint
INSERT INTO plant_points(id,label,kind,warehouse_id,block_id,published_version_id,active)
SELECT DISTINCT ON (node->>'id') node->>'id',node->>'label',node->>'kind',
  CASE WHEN EXISTS(SELECT 1 FROM warehouses w WHERE w.id=(node->>'warehouseId')::bigint) THEN (node->>'warehouseId')::bigint END,
  CASE WHEN EXISTS(SELECT 1 FROM blocks b WHERE b.id=(node->>'blockId')::bigint) THEN (node->>'blockId')::bigint END,
  CASE WHEN mv.status='Publicada' THEN mv.id END,CASE WHEN mv.status='Publicada' THEN 1 ELSE 0 END
FROM map_versions mv CROSS JOIN LATERAL jsonb_array_elements(mv.graph->'nodes') node
WHERE node->>'id' IS NOT NULL AND node->>'label' IS NOT NULL AND node->>'kind' IS NOT NULL
ORDER BY node->>'id',(mv.status='Publicada') DESC,mv.id DESC;
--> statement-breakpoint
CREATE TABLE workplaces (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code varchar(64) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  branch_id bigint NOT NULL REFERENCES branches(id),
  block_id bigint NOT NULL REFERENCES blocks(id),
  sector_id bigint NOT NULL,
  point_id varchar(64) REFERENCES plant_points(id),
  FOREIGN KEY(sector_id,branch_id,block_id) REFERENCES sectors(id,branch_id,block_id),
  UNIQUE(id,branch_id,block_id,sector_id)
);
--> statement-breakpoint
ALTER TABLE users ADD COLUMN branch_id bigint REFERENCES branches(id);
ALTER TABLE users ADD COLUMN sector_id bigint REFERENCES sectors(id);
ALTER TABLE users ADD COLUMN workplace_id bigint;
ALTER TABLE users ADD CONSTRAINT fk_user_workplace FOREIGN KEY(workplace_id,branch_id,block_id,sector_id) REFERENCES workplaces(id,branch_id,block_id,sector_id);
ALTER TABLE users ADD CONSTRAINT ck_user_workplace CHECK(workplace_id IS NULL OR (branch_id IS NOT NULL AND block_id IS NOT NULL AND sector_id IS NOT NULL));
ALTER TABLE inventory ADD CONSTRAINT fk_inventory_point FOREIGN KEY(map_node_id) REFERENCES plant_points(id) NOT VALID;
ALTER TABLE requests ADD COLUMN sector_id bigint REFERENCES sectors(id);
ALTER TABLE requests ADD COLUMN workplace_id bigint REFERENCES workplaces(id);
--> statement-breakpoint
ALTER TABLE parts ADD COLUMN image_source text;
ALTER TABLE parts ADD COLUMN pack_verified smallint NOT NULL DEFAULT 1 CHECK(pack_verified IN (0,1));
ALTER TABLE parts ADD COLUMN image_usage text;
ALTER TABLE parts ADD COLUMN image_verified_at timestamp(3);
ALTER TABLE parts ADD COLUMN image_verified_by bigint REFERENCES users(id);
ALTER TABLE parts ALTER COLUMN reference_unit_price DROP NOT NULL;
ALTER TABLE parts ALTER COLUMN reference_unit_price SET DEFAULT NULL;
--> statement-breakpoint
CREATE TABLE material_import_runs (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  file_name varchar(190) NOT NULL,
  file_hash char(64) NOT NULL UNIQUE,
  mapping jsonb NOT NULL,
  actor_id bigint NOT NULL REFERENCES users(id),
  created_at timestamp(3) NOT NULL DEFAULT now()
);
CREATE TABLE material_import_lines (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  run_id bigint NOT NULL REFERENCES material_import_runs(id),
  sheet varchar(120) NOT NULL,
  row_number integer NOT NULL,
  code varchar(64) NOT NULL,
  branch_code varchar(64) NOT NULL,
  material_id bigint REFERENCES parts(id),
  raw_cells jsonb NOT NULL,
  parameters jsonb NOT NULL,
  consumption jsonb NOT NULL,
  conflicts jsonb NOT NULL,
  UNIQUE(run_id,sheet,row_number)
);
CREATE TABLE reported_balances (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_line_id bigint NOT NULL UNIQUE REFERENCES material_import_lines(id),
  material_id bigint REFERENCES parts(id),
  branch_id bigint NOT NULL REFERENCES branches(id),
  warehouse_id bigint REFERENCES warehouses(id),
  quantity numeric(20,6),
  unit varchar(32) NOT NULL,
  reconciliation_movement_id bigint REFERENCES stock_movements(id)
);
CREATE TABLE reported_purchases (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_line_id bigint NOT NULL UNIQUE REFERENCES material_import_lines(id),
  material_id bigint REFERENCES parts(id),
  branch_id bigint NOT NULL REFERENCES branches(id),
  directive text,
  order_quantity numeric(20,6),
  parcel_total numeric(20,6),
  programme jsonb NOT NULL
);
