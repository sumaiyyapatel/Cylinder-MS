ALTER TABLE "cylinder_movements"
  ALTER COLUMN "cylinder_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "gas_code" TEXT,
  ADD COLUMN IF NOT EXISTS "owner_code" TEXT;

CREATE INDEX IF NOT EXISTS "cylinder_movements_gas_code_owner_code_movement_date_idx"
  ON "cylinder_movements"("gas_code", "owner_code", "movement_date");

UPDATE "cylinder_movements" m
SET
  "gas_code" = COALESCE(m."gas_code", c."gas_code"),
  "owner_code" = COALESCE(m."owner_code", c."owner_code")
FROM "cylinders" c
WHERE m."cylinder_id" = c."id";

DROP INDEX IF EXISTS "ledger_entries_voucher_row_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_voucher_party_type_unique"
  ON "ledger_entries"("voucher_number", "party_code", "transaction_type");

ALTER TABLE "ledger_entries"
  DROP CONSTRAINT IF EXISTS "ledger_entries_single_side_amount",
  ADD CONSTRAINT "ledger_entries_single_side_amount"
  CHECK (
    (
      "debit_amount" IS NOT NULL
      AND "debit_amount" > 0
      AND "credit_amount" IS NULL
    )
    OR
    (
      "credit_amount" IS NOT NULL
      AND "credit_amount" > 0
      AND "debit_amount" IS NULL
    )
  );

ALTER TABLE "cylinder_movements"
  DROP CONSTRAINT IF EXISTS "cylinder_movements_quantity_non_negative",
  ADD CONSTRAINT "cylinder_movements_quantity_non_negative"
  CHECK (
    "quantity_cyl" >= 0
    AND ("quantity_cum" IS NULL OR "quantity_cum" >= 0)
  ),
  DROP CONSTRAINT IF EXISTS "cylinder_movements_serial_or_quantity",
  ADD CONSTRAINT "cylinder_movements_serial_or_quantity"
  CHECK (
    "cylinder_id" IS NOT NULL
    OR "gas_code" IS NOT NULL
  );

ALTER TABLE "delivery_route_traces"
  DROP CONSTRAINT IF EXISTS "delivery_route_traces_route_array",
  ADD CONSTRAINT "delivery_route_traces_route_array"
  CHECK (
    jsonb_typeof("route") = 'array'
    AND jsonb_array_length("route") > 0
  );
