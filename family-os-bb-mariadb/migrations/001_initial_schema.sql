-- Family OS BB MariaDB initial schema.
-- Target: MariaDB 10.11+.
-- Apply to an empty, per-tenant database such as familyos_gary_bb.
-- The BB Data API must use UTC for DATETIME(3) values and convert at its boundary.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  checksum_sha256 CHAR(64) NULL,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS baby_profiles (
  baby_person_id VARCHAR(64) NOT NULL,
  household_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(100) NULL,
  birth_date DATE NULL,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by VARCHAR(64) NOT NULL DEFAULT 'system',
  updated_by VARCHAR(64) NOT NULL DEFAULT 'system',
  notes TEXT NULL,
  PRIMARY KEY (baby_person_id),
  KEY idx_baby_profiles_household_status (household_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS baby_events (
  event_id VARCHAR(64) NOT NULL,
  household_id VARCHAR(64) NOT NULL,
  baby_person_id VARCHAR(64) NOT NULL,
  event_type ENUM('feeding', 'diaper', 'temperature') NOT NULL,
  event_at DATETIME(3) NOT NULL,
  recorded_by_person_id VARCHAR(64) NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'bb_data_api',
  status ENUM('active', 'deleted') NOT NULL DEFAULT 'active',
  client_request_id CHAR(36) NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by VARCHAR(64) NOT NULL DEFAULT 'bb_data_api',
  updated_by VARCHAR(64) NOT NULL DEFAULT 'bb_data_api',
  notes TEXT NULL,
  PRIMARY KEY (event_id),
  CONSTRAINT fk_baby_events_profile
    FOREIGN KEY (baby_person_id) REFERENCES baby_profiles (baby_person_id),
  CONSTRAINT chk_baby_events_row_version
    CHECK (row_version >= 1),
  UNIQUE KEY uq_baby_events_client_request_id (client_request_id),
  KEY idx_baby_events_household_event (household_id, event_at),
  KEY idx_baby_events_baby_status_event (baby_person_id, status, event_at),
  KEY idx_baby_events_baby_type_event (baby_person_id, event_type, event_at),
  KEY idx_baby_events_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS baby_feeding_logs (
  event_id VARCHAR(64) NOT NULL,
  feeding_method ENUM('formula_milk', 'breast_milk', 'expressed_milk', 'solid_food', 'other') NOT NULL DEFAULT 'formula_milk',
  prepared_amount_ml DECIMAL(10,2) NULL,
  consumed_amount_ml DECIMAL(10,2) NULL,
  feed_started_at DATETIME(3) NULL,
  feed_ended_at DATETIME(3) NULL,
  bottle_expires_at DATETIME(3) NULL,
  medicine_given BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (event_id),
  CONSTRAINT fk_baby_feeding_logs_event
    FOREIGN KEY (event_id) REFERENCES baby_events (event_id),
  CONSTRAINT chk_baby_feeding_logs_amounts
    CHECK (
      (prepared_amount_ml IS NULL OR prepared_amount_ml >= 0)
      AND (consumed_amount_ml IS NULL OR consumed_amount_ml BETWEEN 0 AND 2000)
      AND (prepared_amount_ml IS NULL OR consumed_amount_ml IS NULL OR consumed_amount_ml <= prepared_amount_ml)
    ),
  CONSTRAINT chk_baby_feeding_logs_time_order
    CHECK (feed_ended_at IS NULL OR feed_started_at IS NULL OR feed_ended_at >= feed_started_at),
  KEY idx_baby_feeding_logs_started_at (feed_started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS baby_feeding_medications (
  feeding_medication_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  medicine_name VARCHAR(128) NULL,
  dosage_amount DECIMAL(10,2) NULL,
  dosage_unit VARCHAR(32) NULL,
  administered_at DATETIME(3) NULL,
  notes TEXT NULL,
  PRIMARY KEY (feeding_medication_id),
  CONSTRAINT fk_baby_feeding_medications_event
    FOREIGN KEY (event_id) REFERENCES baby_feeding_logs (event_id),
  KEY idx_baby_feeding_medications_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS baby_diaper_logs (
  event_id VARCHAR(64) NOT NULL,
  pee_intensity ENUM('none', 'small', 'medium', 'large') NOT NULL DEFAULT 'none',
  poo_intensity ENUM('none', 'small', 'medium', 'large') NOT NULL DEFAULT 'none',
  poo_color VARCHAR(32) NULL,
  poo_consistency VARCHAR(32) NULL,
  PRIMARY KEY (event_id),
  CONSTRAINT fk_baby_diaper_logs_event
    FOREIGN KEY (event_id) REFERENCES baby_events (event_id),
  CONSTRAINT chk_baby_diaper_logs_content
    CHECK (pee_intensity <> 'none' OR poo_intensity <> 'none')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS baby_temperature_logs (
  event_id VARCHAR(64) NOT NULL,
  temperature_celsius DECIMAL(4,1) NOT NULL,
  measurement_method ENUM('underarm', 'ear', 'forehead', 'rectal', 'oral', 'other') NULL,
  device_label VARCHAR(100) NULL,
  PRIMARY KEY (event_id),
  CONSTRAINT fk_baby_temperature_logs_event
    FOREIGN KEY (event_id) REFERENCES baby_events (event_id),
  CONSTRAINT chk_baby_temperature_logs_range
    CHECK (temperature_celsius BETWEEN 30.0 AND 45.0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS baby_event_audit (
  audit_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  household_id VARCHAR(64) NOT NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  operation ENUM('append', 'update', 'delete', 'import') NOT NULL,
  actor_type VARCHAR(32) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  source VARCHAR(64) NOT NULL,
  changed_fields JSON NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  request_text TEXT NULL,
  result_status ENUM('success', 'rejected', 'failed') NOT NULL DEFAULT 'success',
  PRIMARY KEY (audit_id),
  CONSTRAINT fk_baby_event_audit_event
    FOREIGN KEY (event_id) REFERENCES baby_events (event_id),
  KEY idx_baby_event_audit_event_changed (event_id, changed_at),
  KEY idx_baby_event_audit_household_changed (household_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS baby_event_imports (
  source_system VARCHAR(64) NOT NULL,
  source_record_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  source_payload JSON NOT NULL,
  imported_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source_system, source_record_id),
  CONSTRAINT fk_baby_event_imports_event
    FOREIGN KEY (event_id) REFERENCES baby_events (event_id),
  UNIQUE KEY uq_baby_event_imports_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Temporary compatibility surface for the current iPad response shape.
-- The API, not this view, performs UTC to Asia/Hong_Kong timestamp conversion.
CREATE OR REPLACE VIEW v_baby_log_compat AS
SELECT
  event.event_id AS baby_log_id,
  event.household_id,
  event.event_at,
  event.baby_person_id,
  event.event_type AS log_type,
  CASE event.event_type
    WHEN 'feeding' THEN feeding.feeding_method
    WHEN 'diaper' THEN 'pee_poo'
    WHEN 'temperature' THEN 'body'
  END AS log_subtype,
  event.notes AS description,
  CASE event.event_type
    WHEN 'feeding' THEN feeding.consumed_amount_ml
    WHEN 'temperature' THEN temperature.temperature_celsius
  END AS value_number,
  CASE event.event_type
    WHEN 'diaper' THEN JSON_OBJECT('pee', diaper.pee_intensity, 'poo', diaper.poo_intensity)
  END AS value_text,
  CASE event.event_type
    WHEN 'feeding' THEN 'ml'
    WHEN 'temperature' THEN 'celsius'
  END AS unit,
  feeding.feed_started_at AS started_at,
  feeding.feed_ended_at AS ended_at,
  CASE
    WHEN feeding.feed_started_at IS NOT NULL AND feeding.feed_ended_at IS NOT NULL
      THEN TIMESTAMPDIFF(MINUTE, feeding.feed_started_at, feeding.feed_ended_at)
  END AS duration_minutes,
  event.recorded_by_person_id,
  event.status,
  event.row_version,
  event.created_at,
  event.updated_at,
  event.created_by,
  event.updated_by,
  event.notes AS remarks
FROM baby_events AS event
LEFT JOIN baby_feeding_logs AS feeding ON feeding.event_id = event.event_id
LEFT JOIN baby_diaper_logs AS diaper ON diaper.event_id = event.event_id
LEFT JOIN baby_temperature_logs AS temperature ON temperature.event_id = event.event_id;

INSERT INTO schema_migrations (version, checksum_sha256)
VALUES ('001_initial_schema', NULL)
ON DUPLICATE KEY UPDATE version = VALUES(version);
