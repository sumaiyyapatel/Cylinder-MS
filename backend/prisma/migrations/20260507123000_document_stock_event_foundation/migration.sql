DO $$ BEGIN
  CREATE TYPE "CylinderStatus_new" AS ENUM (
    'IN_STOCK',
    'WITH_CUSTOMER',
    'IN_TRANSIT',
    'RETURNED',
    'REFILLED',
    'DAMAGED',
    'UNDER_TEST',
    'CONDEMNED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "cylinders"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "cylinders"
  ALTER COLUMN "status" TYPE "CylinderStatus_new"
  USING ("status"::text::"CylinderStatus_new");

ALTER TABLE "cylinders"
  ALTER COLUMN "status" SET DEFAULT 'IN_STOCK';

DROP TYPE IF EXISTS "CylinderStatus";
ALTER TYPE "CylinderStatus_new" RENAME TO "CylinderStatus";

DO $$ BEGIN
  CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'FINALIZED', 'CANCELLED', 'REVERSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InventoryDirection" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InventoryTrackingMode" AS ENUM ('SERIALIZED', 'QUANTITY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "gas_types"
  ADD COLUMN IF NOT EXISTS "tracking_mode" "InventoryTrackingMode" NOT NULL DEFAULT 'SERIALIZED';

ALTER TABLE "bills"
  ADD COLUMN IF NOT EXISTS "document_status" "DocumentStatus" NOT NULL DEFAULT 'FINALIZED',
  ADD COLUMN IF NOT EXISTS "finalized_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_by" INTEGER;

ALTER TABLE "bills"
  ALTER COLUMN "finalized_at" SET DEFAULT CURRENT_TIMESTAMP;

UPDATE "bills"
SET "finalized_at" = COALESCE("finalized_at", "created_at", CURRENT_TIMESTAMP)
WHERE "document_status" = 'FINALIZED';

ALTER TABLE "challans"
  ADD COLUMN IF NOT EXISTS "document_status" "DocumentStatus" NOT NULL DEFAULT 'FINALIZED',
  ADD COLUMN IF NOT EXISTS "finalized_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_by" INTEGER;

ALTER TABLE "challans"
  ALTER COLUMN "finalized_at" SET DEFAULT CURRENT_TIMESTAMP;

UPDATE "challans"
SET "finalized_at" = COALESCE("finalized_at", "created_at", CURRENT_TIMESTAMP)
WHERE "document_status" = 'FINALIZED';

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "document_status" "DocumentStatus" NOT NULL DEFAULT 'FINALIZED',
  ADD COLUMN IF NOT EXISTS "finalized_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_by" INTEGER;

ALTER TABLE "payments"
  ALTER COLUMN "finalized_at" SET DEFAULT CURRENT_TIMESTAMP;

UPDATE "payments"
SET "finalized_at" = COALESCE("finalized_at", "created_at", CURRENT_TIMESTAMP)
WHERE "document_status" = 'FINALIZED';

ALTER TABLE "ecr_records"
  ADD COLUMN IF NOT EXISTS "document_status" "DocumentStatus" NOT NULL DEFAULT 'FINALIZED',
  ADD COLUMN IF NOT EXISTS "finalized_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_by" INTEGER;

ALTER TABLE "ecr_records"
  ALTER COLUMN "finalized_at" SET DEFAULT CURRENT_TIMESTAMP;

UPDATE "ecr_records"
SET "finalized_at" = COALESCE("finalized_at", "created_at", CURRENT_TIMESTAMP)
WHERE "document_status" = 'FINALIZED';

CREATE INDEX IF NOT EXISTS "bills_document_status_idx" ON "bills"("document_status");
CREATE INDEX IF NOT EXISTS "bills_is_deleted_idx" ON "bills"("is_deleted");
CREATE INDEX IF NOT EXISTS "challans_document_status_idx" ON "challans"("document_status");
CREATE INDEX IF NOT EXISTS "challans_is_deleted_idx" ON "challans"("is_deleted");
CREATE INDEX IF NOT EXISTS "payments_document_status_idx" ON "payments"("document_status");
CREATE INDEX IF NOT EXISTS "payments_is_deleted_idx" ON "payments"("is_deleted");
CREATE INDEX IF NOT EXISTS "ecr_records_document_status_idx" ON "ecr_records"("document_status");
CREATE INDEX IF NOT EXISTS "ecr_records_is_deleted_idx" ON "ecr_records"("is_deleted");

CREATE TABLE IF NOT EXISTS "warehouses" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "branch_code" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "warehouses_branch_code_idx" ON "warehouses"("branch_code");

INSERT INTO "warehouses" ("code", "name", "is_default")
VALUES ('MAIN', 'Main Godown', true)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE IF NOT EXISTS "stock_ledger" (
  "id" SERIAL PRIMARY KEY,
  "movement_id" INTEGER UNIQUE,
  "warehouse_id" INTEGER NOT NULL,
  "gas_code" TEXT,
  "owner_code" TEXT,
  "cylinder_id" INTEGER,
  "direction" "InventoryDirection" NOT NULL,
  "movement_date" TIMESTAMP(3) NOT NULL,
  "quantity_cyl" INTEGER NOT NULL DEFAULT 0,
  "quantity_cum" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "balance_cyl" INTEGER NOT NULL DEFAULT 0,
  "balance_cum" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "reference_type" TEXT,
  "reference_number" TEXT,
  "operator_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_ledger_movement_id_fkey"
    FOREIGN KEY ("movement_id") REFERENCES "cylinder_movements"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stock_ledger_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_ledger_cylinder_id_fkey"
    FOREIGN KEY ("cylinder_id") REFERENCES "cylinders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "stock_ledger_warehouse_id_gas_code_owner_code_movement_date_idx"
  ON "stock_ledger"("warehouse_id", "gas_code", "owner_code", "movement_date");

CREATE INDEX IF NOT EXISTS "stock_ledger_cylinder_id_movement_date_idx"
  ON "stock_ledger"("cylinder_id", "movement_date");

CREATE INDEX IF NOT EXISTS "stock_ledger_reference_type_reference_number_idx"
  ON "stock_ledger"("reference_type", "reference_number");

CREATE TABLE IF NOT EXISTS "inventory_balance" (
  "id" SERIAL PRIMARY KEY,
  "warehouse_id" INTEGER NOT NULL,
  "gas_code" TEXT,
  "owner_code" TEXT,
  "quantity_cyl" INTEGER NOT NULL DEFAULT 0,
  "quantity_cum" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_balance_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_balance_key"
  ON "inventory_balance"("warehouse_id", "gas_code", "owner_code");

CREATE INDEX IF NOT EXISTS "inventory_balance_gas_code_owner_code_idx"
  ON "inventory_balance"("gas_code", "owner_code");

CREATE TABLE IF NOT EXISTS "daily_closing_stock" (
  "id" SERIAL PRIMARY KEY,
  "closing_date" TIMESTAMP(3) NOT NULL,
  "warehouse_id" INTEGER NOT NULL,
  "gas_code" TEXT,
  "owner_code" TEXT,
  "quantity_cyl" INTEGER NOT NULL DEFAULT 0,
  "quantity_cum" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_closing_stock_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_closing_stock_key"
  ON "daily_closing_stock"("closing_date", "warehouse_id", "gas_code", "owner_code");

CREATE INDEX IF NOT EXISTS "daily_closing_stock_warehouse_id_closing_date_idx"
  ON "daily_closing_stock"("warehouse_id", "closing_date");

CREATE TABLE IF NOT EXISTS "domain_events" (
  "id" SERIAL PRIMARY KEY,
  "event_type" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "operator_id" INTEGER,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "domain_events_event_type_occurred_at_idx"
  ON "domain_events"("event_type", "occurred_at");

CREATE INDEX IF NOT EXISTS "domain_events_aggregate_type_aggregate_id_idx"
  ON "domain_events"("aggregate_type", "aggregate_id");
