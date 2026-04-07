-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT', 'VIEWER');

-- CreateEnum
CREATE TYPE "CylinderStatus" AS ENUM ('IN_STOCK', 'WITH_CUSTOMER', 'IN_TRANSIT', 'DAMAGED', 'UNDER_TEST', 'CONDEMNED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HoldingStatus" AS ENUM ('HOLDING', 'RETURNED', 'BILLED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('OVERDUE_CYLINDER', 'PAYMENT_DUE', 'LOW_STOCK', 'TEST_DUE', 'CONDEMNED');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(10) NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(5) NOT NULL,
    "title" VARCHAR(10),
    "name" TEXT NOT NULL,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "pin" VARCHAR(10),
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "gstin" VARCHAR(15),
    "contact_person" TEXT,
    "area_code" VARCHAR(1),
    "credit_limit" DECIMAL(12,2) DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cylinders" (
    "id" SERIAL NOT NULL,
    "owner_code" VARCHAR(3) NOT NULL,
    "cylinder_number" TEXT NOT NULL,
    "particular" TEXT,
    "capacity" DECIMAL(10,2),
    "gas_code" VARCHAR(2),
    "status" "CylinderStatus" NOT NULL DEFAULT 'IN_STOCK',
    "manufacture_date" TIMESTAMP(3),
    "hydro_test_date" TIMESTAMP(3),
    "next_test_due" TIMESTAMP(3),
    "fill_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cylinders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gas_types" (
    "id" SERIAL NOT NULL,
    "gas_code" VARCHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "chemical_name" TEXT,
    "formula" TEXT,
    "hsn_code" TEXT,
    "gst_rate" DECIMAL(5,2),
    "item_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gas_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" SERIAL NOT NULL,
    "area_code" VARCHAR(1) NOT NULL,
    "area_name" TEXT NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "order_number" TEXT NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "gas_code" VARCHAR(2),
    "owner_code" VARCHAR(3),
    "quantity_cum" DECIMAL(10,2),
    "quantity_cyl" INTEGER,
    "rate" DECIMAL(10,2),
    "freight_rate" DECIMAL(10,2),
    "sales_tax_rate" DECIMAL(5,2),
    "discount" DECIMAL(10,2),
    "status" "OrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_list" (
    "id" SERIAL NOT NULL,
    "gas_code" VARCHAR(2) NOT NULL,
    "owner_code" VARCHAR(3) NOT NULL,
    "cylinder_type" TEXT,
    "rate_per_unit" DECIMAL(10,2),
    "rental_free_days" INTEGER DEFAULT 0,
    "rental_rate1" DECIMAL(10,2),
    "rental_days_from1" INTEGER,
    "rental_days_to1" INTEGER,
    "rental_rate2" DECIMAL(10,2),
    "rental_days_from2" INTEGER,
    "rental_days_to2" INTEGER,
    "rental_rate3" DECIMAL(10,2),
    "rental_days_from3" INTEGER,
    "rental_days_to3" INTEGER,
    "gst_rate" DECIMAL(5,2),
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),

    CONSTRAINT "rate_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "bill_number" TEXT NOT NULL,
    "bill_date" TIMESTAMP(3) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "gas_code" VARCHAR(2),
    "cylinder_owner" VARCHAR(3),
    "cylinder_number" TEXT,
    "quantity_cum" DECIMAL(10,2),
    "order_number" TEXT,
    "transaction_code" TEXT,
    "reason_code" TEXT,
    "full_or_empty" VARCHAR(1),
    "rent_amount" DECIMAL(12,2),
    "operator_id" INTEGER,
    "whatsapp_sent" BOOLEAN NOT NULL DEFAULT false,
    "pdf_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecr_records" (
    "id" SERIAL NOT NULL,
    "ecr_number" TEXT NOT NULL,
    "ecr_date" TIMESTAMP(3) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "gas_code" VARCHAR(2),
    "cylinder_owner" VARCHAR(3),
    "cylinder_number" TEXT,
    "issue_number" TEXT,
    "issue_date" TIMESTAMP(3),
    "hold_days" INTEGER,
    "rent_amount" DECIMAL(12,2),
    "challan_number" TEXT,
    "challan_date" TIMESTAMP(3),
    "vehicle_number" TEXT,
    "operator_id" INTEGER,
    "quantity_cum" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ecr_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cylinder_holdings" (
    "id" SERIAL NOT NULL,
    "cylinder_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "transaction_id" INTEGER,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "returned_at" TIMESTAMP(3),
    "hold_days" INTEGER,
    "rent_amount" DECIMAL(12,2),
    "is_overdue" BOOLEAN NOT NULL DEFAULT false,
    "alert_sent_at" TIMESTAMP(3),
    "status" "HoldingStatus" NOT NULL DEFAULT 'HOLDING',

    CONSTRAINT "cylinder_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challans" (
    "id" SERIAL NOT NULL,
    "challan_number" TEXT NOT NULL,
    "challan_date" TIMESTAMP(3) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "cylinder_owner" VARCHAR(3),
    "cylinders_count" INTEGER,
    "quantity_cum" DECIMAL(10,2),
    "vehicle_number" TEXT,
    "transaction_type" TEXT,
    "linked_bill_id" INTEGER,
    "operator_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" SERIAL NOT NULL,
    "voucher_number" TEXT NOT NULL,
    "voucher_date" TIMESTAMP(3) NOT NULL,
    "party_code" VARCHAR(5),
    "particular" TEXT,
    "narration" TEXT,
    "debit_amount" DECIMAL(12,2),
    "credit_amount" DECIMAL(12,2),
    "cheque_number" TEXT,
    "transaction_type" TEXT,
    "voucher_ref" TEXT,
    "operator_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_book" (
    "id" SERIAL NOT NULL,
    "voucher_number" TEXT NOT NULL,
    "voucher_date" TIMESTAMP(3) NOT NULL,
    "party_code" VARCHAR(5),
    "document_number" TEXT,
    "quantity_issued" DECIMAL(10,2),
    "unit" TEXT,
    "rate" DECIMAL(10,2),
    "gst_code" TEXT,
    "subtotal" DECIMAL(12,2),
    "gst_amount" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2),
    "transaction_code" TEXT,
    "operator_id" INTEGER,
    "bill_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gst_rates" (
    "id" SERIAL NOT NULL,
    "gst_code" TEXT NOT NULL,
    "gst_name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gst_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "type" "AlertType" NOT NULL,
    "customer_id" INTEGER,
    "cylinder_id" INTEGER,
    "message" TEXT NOT NULL,
    "sent_via" "AlertChannel" NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cylinders_cylinder_number_key" ON "cylinders"("cylinder_number");

-- CreateIndex
CREATE UNIQUE INDEX "gas_types_gas_code_key" ON "gas_types"("gas_code");

-- CreateIndex
CREATE UNIQUE INDEX "areas_area_code_key" ON "areas"("area_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_bill_number_key" ON "transactions"("bill_number");

-- CreateIndex
CREATE UNIQUE INDEX "ecr_records_ecr_number_key" ON "ecr_records"("ecr_number");

-- CreateIndex
CREATE UNIQUE INDEX "challans_challan_number_key" ON "challans"("challan_number");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_voucher_number_key" ON "ledger_entries"("voucher_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_book_voucher_number_key" ON "sales_book"("voucher_number");

-- CreateIndex
CREATE UNIQUE INDEX "gst_rates_gst_code_key" ON "gst_rates"("gst_code");

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_key_key" ON "company_settings"("key");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_area_code_fkey" FOREIGN KEY ("area_code") REFERENCES "areas"("area_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cylinders" ADD CONSTRAINT "cylinders_gas_code_fkey" FOREIGN KEY ("gas_code") REFERENCES "gas_types"("gas_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_list" ADD CONSTRAINT "rate_list_gas_code_fkey" FOREIGN KEY ("gas_code") REFERENCES "gas_types"("gas_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecr_records" ADD CONSTRAINT "ecr_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cylinder_holdings" ADD CONSTRAINT "cylinder_holdings_cylinder_id_fkey" FOREIGN KEY ("cylinder_id") REFERENCES "cylinders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cylinder_holdings" ADD CONSTRAINT "cylinder_holdings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cylinder_holdings" ADD CONSTRAINT "cylinder_holdings_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_party_code_fkey" FOREIGN KEY ("party_code") REFERENCES "customers"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_book" ADD CONSTRAINT "sales_book_party_code_fkey" FOREIGN KEY ("party_code") REFERENCES "customers"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_cylinder_id_fkey" FOREIGN KEY ("cylinder_id") REFERENCES "cylinders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
