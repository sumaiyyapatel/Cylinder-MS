ALTER TABLE "cylinder_holdings"
ADD COLUMN IF NOT EXISTS "challan_id" INTEGER;

CREATE INDEX IF NOT EXISTS "cylinder_holdings_challan_id_idx" ON "cylinder_holdings"("challan_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'cylinder_holdings_challan_id_fkey'
    ) THEN
        ALTER TABLE "cylinder_holdings"
        ADD CONSTRAINT "cylinder_holdings_challan_id_fkey"
        FOREIGN KEY ("challan_id") REFERENCES "challans"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
