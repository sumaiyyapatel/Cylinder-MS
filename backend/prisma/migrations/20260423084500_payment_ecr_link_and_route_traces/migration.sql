ALTER TABLE "payments"
ADD COLUMN IF NOT EXISTS "ecr_id" INTEGER;

CREATE INDEX IF NOT EXISTS "payments_ecr_id_idx" ON "payments"("ecr_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'payments_ecr_id_fkey'
    ) THEN
        ALTER TABLE "payments"
        ADD CONSTRAINT "payments_ecr_id_fkey"
        FOREIGN KEY ("ecr_id") REFERENCES "ecr_records"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "delivery_route_traces" (
    "id" SERIAL NOT NULL,
    "bill_id" INTEGER,
    "challan_id" INTEGER,
    "operator_id" INTEGER,
    "route" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_route_traces_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "delivery_route_traces_bill_id_idx" ON "delivery_route_traces"("bill_id");
CREATE INDEX IF NOT EXISTS "delivery_route_traces_challan_id_idx" ON "delivery_route_traces"("challan_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'delivery_route_traces_bill_id_fkey'
    ) THEN
        ALTER TABLE "delivery_route_traces"
        ADD CONSTRAINT "delivery_route_traces_bill_id_fkey"
        FOREIGN KEY ("bill_id") REFERENCES "bills"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'delivery_route_traces_challan_id_fkey'
    ) THEN
        ALTER TABLE "delivery_route_traces"
        ADD CONSTRAINT "delivery_route_traces_challan_id_fkey"
        FOREIGN KEY ("challan_id") REFERENCES "challans"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
