CREATE TABLE IF NOT EXISTS "cylinder_movements" (
  "id" SERIAL PRIMARY KEY,
  "cylinder_id" INTEGER NOT NULL,
  "customer_id" INTEGER NULL,
  "holding_id" INTEGER NULL,
  "movement_type" TEXT NOT NULL,
  "movement_date" TIMESTAMP(3) NOT NULL,
  "quantity_cyl" INTEGER NOT NULL DEFAULT 1,
  "quantity_cum" DECIMAL(65,30) NULL,
  "status_before" TEXT NULL,
  "status_after" TEXT NULL,
  "reference_type" TEXT NULL,
  "reference_number" TEXT NULL,
  "operator_id" INTEGER NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cylinder_movements_cylinder_id_fkey"
    FOREIGN KEY ("cylinder_id") REFERENCES "cylinders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cylinder_movements_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cylinder_movements_holding_id_fkey"
    FOREIGN KEY ("holding_id") REFERENCES "cylinder_holdings"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cylinder_movements_cylinder_id_movement_date_idx"
  ON "cylinder_movements"("cylinder_id", "movement_date");

CREATE INDEX IF NOT EXISTS "cylinder_movements_customer_id_movement_date_idx"
  ON "cylinder_movements"("customer_id", "movement_date");

CREATE INDEX IF NOT EXISTS "cylinder_movements_movement_type_movement_date_idx"
  ON "cylinder_movements"("movement_type", "movement_date");

CREATE INDEX IF NOT EXISTS "cylinder_movements_reference_type_reference_number_idx"
  ON "cylinder_movements"("reference_type", "reference_number");

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "unit_rate" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "taxable_amount" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "hsn_code" TEXT,
  ADD COLUMN IF NOT EXISTS "gst_rate" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "gst_amount" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "cgst_amount" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "sgst_amount" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "igst_amount" DECIMAL(65,30);

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_voucher_row_unique"
  ON "ledger_entries"("voucher_number", "party_code", "particular", "transaction_type", "voucher_ref");
