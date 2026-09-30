-- MySQL 8: execute o arquivo inteiro no Workbench.
-- Este bloco cria e seleciona o banco local sem apagar dados existentes.
CREATE DATABASE IF NOT EXISTS `marcon`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `marcon`;

-- BEGIN TABLES
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(80) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS blocks (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS warehouses (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL UNIQUE,
  block_id BIGINT UNSIGNED NULL UNIQUE,
  is_central BOOLEAN NOT NULL DEFAULT FALSE,
  central_guard TINYINT GENERATED ALWAYS AS (CASE WHEN is_central THEN 1 ELSE NULL END) STORED UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_warehouse_block FOREIGN KEY (block_id) REFERENCES blocks(id),
  CONSTRAINT chk_warehouse_location CHECK ((is_central = TRUE AND block_id IS NULL) OR (is_central = FALSE AND block_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  employee_no VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(190) NOT NULL,
  role ENUM('admin','lider','almoxarifado','funcionario') NOT NULL,
  sector VARCHAR(80) NOT NULL,
  block_id BIGINT UNSIGNED NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_block FOREIGN KEY (block_id) REFERENCES blocks(id),
  CONSTRAINT chk_user_block CHECK ((role IN ('funcionario','lider') AND block_id IS NOT NULL) OR (role IN ('admin','almoxarifado') AND block_id IS NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS parts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  qr_code VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  image_url MEDIUMTEXT NULL,
  location VARCHAR(80) NOT NULL,
  pack_size INT UNSIGNED NOT NULL DEFAULT 1,
  minimum_total INT UNSIGNED NOT NULL DEFAULT 1,
  consumed_30 INT UNSIGNED NOT NULL DEFAULT 0,
  previous_30 INT UNSIGNED NOT NULL DEFAULT 0,
  lead_days INT UNSIGNED NOT NULL DEFAULT 7,
  reference_unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_part_pack CHECK (pack_size > 0),
  CONSTRAINT chk_part_min CHECK (minimum_total > 0),
  CONSTRAINT chk_part_lead CHECK (lead_days > 0),
  CONSTRAINT chk_part_price CHECK (reference_unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory (
  part_id BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 0,
  minimum_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (part_id, warehouse_id),
  CONSTRAINT fk_inventory_part FOREIGN KEY (part_id) REFERENCES parts(id),
  CONSTRAINT fk_inventory_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  requester_id BIGINT UNSIGNED NOT NULL,
  block_id BIGINT UNSIGNED NOT NULL,
  part_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  priority ENUM('Leve','Moderado','Urgente') NOT NULL DEFAULT 'Leve',
  status ENUM('Pendente','Em análise','Aprovada','Entregue','Cancelada') NOT NULL DEFAULT 'Pendente',
  justification TEXT NULL,
  approved_by BIGINT UNSIGNED NULL,
  fulfilled_by BIGINT UNSIGNED NULL,
  fulfilled_from BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_request_user FOREIGN KEY (requester_id) REFERENCES users(id),
  CONSTRAINT fk_request_block FOREIGN KEY (block_id) REFERENCES blocks(id),
  CONSTRAINT fk_request_part FOREIGN KEY (part_id) REFERENCES parts(id),
  CONSTRAINT fk_request_approver FOREIGN KEY (approved_by) REFERENCES users(id),
  CONSTRAINT fk_request_fulfiller FOREIGN KEY (fulfilled_by) REFERENCES users(id),
  CONSTRAINT fk_request_warehouse FOREIGN KEY (fulfilled_from) REFERENCES warehouses(id),
  CONSTRAINT chk_request_quantity CHECK (quantity > 0),
  INDEX idx_request_block_status (block_id, status, created_at),
  INDEX idx_request_user_date (requester_id, created_at),
  INDEX idx_request_part_date (part_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_transfers (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  part_id BIGINT UNSIGNED NOT NULL,
  source_warehouse_id BIGINT UNSIGNED NOT NULL,
  destination_warehouse_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  qr_code_scanned VARCHAR(128) NOT NULL,
  performed_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_transfer_part FOREIGN KEY (part_id) REFERENCES parts(id),
  CONSTRAINT fk_transfer_source FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_transfer_destination FOREIGN KEY (destination_warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_transfer_user FOREIGN KEY (performed_by) REFERENCES users(id),
  CONSTRAINT chk_transfer_quantity CHECK (quantity > 0),
  CONSTRAINT chk_transfer_dest CHECK (source_warehouse_id <> destination_warehouse_id),
  INDEX idx_transfer_date (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS return_records (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  part_id BIGINT UNSIGNED NOT NULL,
  block_id BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  condition_type ENUM('Apto','Danificado') NOT NULL,
  returned_by VARCHAR(120) NOT NULL,
  note TEXT NULL,
  received_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_return_part FOREIGN KEY (part_id) REFERENCES parts(id),
  CONSTRAINT fk_return_block FOREIGN KEY (block_id) REFERENCES blocks(id),
  CONSTRAINT fk_return_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_return_receiver FOREIGN KEY (received_by) REFERENCES users(id),
  CONSTRAINT chk_return_quantity CHECK (quantity > 0),
  INDEX idx_return_date (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  part_id BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('entrada','saida','transferencia_entrada','transferencia_saida','devolucao','ajuste_entrada','ajuste_saida') NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  request_id BIGINT UNSIGNED NULL,
  transfer_id BIGINT UNSIGNED NULL,
  return_id BIGINT UNSIGNED NULL,
  block_id BIGINT UNSIGNED NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_movement_part FOREIGN KEY (part_id) REFERENCES parts(id),
  CONSTRAINT fk_movement_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_movement_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_movement_transfer FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id),
  CONSTRAINT fk_movement_return FOREIGN KEY (return_id) REFERENCES return_records(id),
  CONSTRAINT fk_movement_block FOREIGN KEY (block_id) REFERENCES blocks(id),
  CONSTRAINT fk_movement_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  CONSTRAINT chk_movement_quantity CHECK (quantity > 0),
  INDEX idx_movement_part_date (part_id, created_at),
  INDEX idx_movement_warehouse_date (warehouse_id, created_at),
  INDEX idx_movement_block_date (block_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_id BIGINT UNSIGNED NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(40) NOT NULL,
  details JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_audit_entity (entity_type, entity_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_attempts (
  identity_digest BINARY(32) PRIMARY KEY,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  first_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  blocked_until DATETIME(3) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id VARCHAR(512) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  public_key BLOB NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_passkey_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_passkey_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS passkey_challenges (
  token_hash BINARY(32) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  challenge VARCHAR(128) NOT NULL,
  purpose ENUM('register','login') NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_passkey_challenge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS face_credentials (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  embeddings MEDIUMBLOB NOT NULL,
  model_version VARCHAR(64) NOT NULL,
  consent_version VARCHAR(40) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_face_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS face_challenges (
  token_hash BINARY(32) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose ENUM('register','login') NOT NULL,
  poses JSON NOT NULL,
  session_hash BINARY(32) NULL,
  password_hash VARCHAR(190) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_face_challenge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_face_challenge_expiry (expires_at)
) ENGINE=InnoDB;
