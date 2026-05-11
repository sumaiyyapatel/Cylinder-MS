DO $$ BEGIN
  CREATE TYPE "DispatchStatus" AS ENUM (
    'PLANNED',
    'ASSIGNED',
    'LOADED',
    'OUT_FOR_DELIVERY',
    'COMPLETED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "dispatch_runs" (
  "id" SERIAL PRIMARY KEY,
  "dispatch_number" TEXT NOT NULL UNIQUE,
  "dispatch_date" TIMESTAMP(3) NOT NULL,
  "status" "DispatchStatus" NOT NULL DEFAULT 'PLANNED',
  "driver_name" TEXT,
  "driver_phone" TEXT,
  "vehicle_number" TEXT,
  "area_code" TEXT,
  "notes" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "operator_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "dispatch_runs_dispatch_date_status_idx"
  ON "dispatch_runs"("dispatch_date", "status");

CREATE INDEX IF NOT EXISTS "dispatch_runs_vehicle_number_idx"
  ON "dispatch_runs"("vehicle_number");

CREATE TABLE IF NOT EXISTS "dispatch_items" (
  "id" SERIAL PRIMARY KEY,
  "dispatch_id" INTEGER NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" INTEGER NOT NULL,
  "ref_number" TEXT NOT NULL,
  "customer_id" INTEGER,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "status" "DispatchStatus" NOT NULL DEFAULT 'PLANNED',
  "delivered_at" TIMESTAMP(3),
  "returned_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_items_dispatch_id_fkey"
    FOREIGN KEY ("dispatch_id") REFERENCES "dispatch_runs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dispatch_items_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "dispatch_items_dispatch_id_sequence_idx"
  ON "dispatch_items"("dispatch_id", "sequence");

CREATE INDEX IF NOT EXISTS "dispatch_items_source_type_source_id_idx"
  ON "dispatch_items"("source_type", "source_id");

CREATE INDEX IF NOT EXISTS "dispatch_items_customer_id_idx"
  ON "dispatch_items"("customer_id");

CREATE INDEX IF NOT EXISTS "dispatch_items_status_idx"
  ON "dispatch_items"("status");

CREATE TABLE IF NOT EXISTS "dispatch_route_traces" (
  "id" SERIAL PRIMARY KEY,
  "dispatch_id" INTEGER NOT NULL,
  "operator_id" INTEGER,
  "route" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_route_traces_dispatch_id_fkey"
    FOREIGN KEY ("dispatch_id") REFERENCES "dispatch_runs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "dispatch_route_traces_dispatch_id_idx"
  ON "dispatch_route_traces"("dispatch_id");
