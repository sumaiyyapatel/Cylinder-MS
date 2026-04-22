CREATE TABLE IF NOT EXISTS "payments" (
    "id" SERIAL NOT NULL,
    "voucher_number" TEXT NOT NULL,
    "voucher_date" TIMESTAMP(3) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "bill_id" INTEGER,
    "payment_mode" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reference" TEXT,
    "operator_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_voucher_number_key" ON "payments"("voucher_number");
CREATE INDEX IF NOT EXISTS "payments_customer_id_voucher_date_idx" ON "payments"("customer_id", "voucher_date");
CREATE INDEX IF NOT EXISTS "payments_bill_id_idx" ON "payments"("bill_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'payments_customer_id_fkey'
    ) THEN
        ALTER TABLE "payments"
        ADD CONSTRAINT "payments_customer_id_fkey"
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'payments_bill_id_fkey'
    ) THEN
        ALTER TABLE "payments"
        ADD CONSTRAINT "payments_bill_id_fkey"
        FOREIGN KEY ("bill_id") REFERENCES "bills"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "customer_balances" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "as_of" TIMESTAMP(3) NOT NULL,
    "total_debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total_credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_balances_customer_id_key" ON "customer_balances"("customer_id");
CREATE INDEX IF NOT EXISTS "customer_balances_customer_id_idx" ON "customer_balances"("customer_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'customer_balances_customer_id_fkey'
    ) THEN
        ALTER TABLE "customer_balances"
        ADD CONSTRAINT "customer_balances_customer_id_fkey"
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
