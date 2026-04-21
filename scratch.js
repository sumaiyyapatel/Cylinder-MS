const fs = require('fs');
let content = fs.readFileSync('backend/prisma/schema.prisma', 'utf8');

const newLedgerEntry = `model Account {
  id            Int          @id @default(autoincrement())
  code          String       @unique
  name          String
  group         AccountGroup
  openingBalance Decimal?    @default(0) @map("opening_balance")
  currentBalance Decimal?    @default(0) @map("current_balance")
  isActive      Boolean      @default(true) @map("is_active")

  customerId    Int?         @unique @map("customer_id")
  customer      Customer?    @relation(fields: [customerId], references: [id])

  ledgerEntries LedgerEntry[]
  createdAt     DateTime     @default(now()) @map("created_at")

  @@map("accounts")
}

model LedgerEntry {
  id              Int       @id @default(autoincrement())
  voucherNumber   String    @map("voucher_number")
  voucherDate     DateTime  @map("voucher_date")
  accountId       Int       @map("account_id")
  particular      String?
  narration       String?
  debitAmount     Decimal?  @map("debit_amount")
  creditAmount    Decimal?  @map("credit_amount")
  chequeNumber    String?   @map("cheque_number")
  transactionType String?   @map("transaction_type")
  voucherRef      String?   @map("voucher_ref")
  operatorId      Int?      @map("operator_id")
  createdAt       DateTime  @default(now()) @map("created_at")

  account         Account   @relation(fields: [accountId], references: [id])

  @@index([voucherNumber])
  @@index([accountId])
  @@map("ledger_entries")
}`;

content = content.replace(/model LedgerEntry \{[\s\S]*?\@\@map\("ledger_entries"\)\n\}/, newLedgerEntry);

// remove ledgerEntries from Customer
content = content.replace(/[ \t]*ledgerEntries[ \t]+LedgerEntry\[\][\r\n]+/, '');

// Add Account relation to Customer
content = content.replace(/(\s+@@map\("customers"\)\n})/, `  account       Account?\n$1`);

fs.writeFileSync('backend/prisma/schema.prisma', content);
