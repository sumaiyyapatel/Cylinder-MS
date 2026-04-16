# Cylinder-MS: Quick Action Checklist

## 🎯 Start Here (This Week)

### 1. **Data Migration Sprint (Priority 1 — Blocks Everything Else)**
- [ ] **Set up ETL pipeline**
  - Create `backend/scripts/migrate-dbf-to-postgres.js`
  - Install dependencies: `npm install dbfread-web` or use existing Python script + Node wrapper
  - Validate DBF file paths on local machine

- [ ] **Map DBF → PostgreSQL**
  - CUST.DBF → `customers` table (extract 226 records)
  - CYL.DBF → `cylinders` table (extract 300 records)
  - BILL*.DBF → `bills` + `transactions` (extract 53K bills as header/detail)
  - ECR*.DBF → `ecr_records` + `cylinder_holdings` (reconstruct hold dates)
  - All ledger DBF files → `ledger_entries` (test per-customer ledger consolidation)

- [ ] **Dry-run validation**
  - Count records before/after: 53K bills, 50K ECR, 226 customers, 300 cylinders
  - Check for referential integrity: no orphaned bills, valid customer/cylinder IDs
  - Spot-check: does a sample bill's rent match the rate_list?

- [ ] **Load master data**
  - 6 gas types
  - Area codes (A, B, C, etc.)
  - Rate lists (3-tier pricing per gas/owner)

---

### 2. **Complete Holding Logic (Priority 2 — Core Business)**
- [ ] **Create `cylinderHoldingService.js`** with three functions:
  ```javascript
  async createHolding(tx, {customerId, cylinderId, challanDate, issueNumber})
  // Called when bill created; records issued_at timestamp
  
  async returnCylinder(tx, {holdingId, ecrDate, customerId})
  // Called when ECR created; sets returned_at, calculates hold_days
  
  async calculateHoldingRent(tx, {holdingId, holdDays, gasCode, ownerCode, customerId})
  // Uses rentalService.calculateRent(); posts to ledger_entries
  ```

- [ ] **Integrate with `/ecr` POST route**
  - On ECR creation: auto-close all holdings issued to that customer for that gas type
  - Recalculate rent based on actual hold days
  - Create ledger entry posting rent to customer account
  - Set holding status = RETURNED

- [ ] **Write test script** (`backend/tests/holding-flow.test.js`)
  - Bill → Challan → Holding created ✓
  - Challan convert → Bill issued ✓
  - ECR created → Holding closed + rent calculated ✓
  - Ledger entry posted ✓

---

### 3. **Reconciliation Audit (Priority 3 — Before Go-Live)**
- [ ] **Finish `reconciliationService.js`** stub:
  ```javascript
  async validateHoldingRents(tx, customerId)
  // Sum rents from holdings vs. ECR charges; flag mismatches
  
  async findOrphanedHoldings(tx)
  // Find cylinders issued but never returned (over threshold)
  
  async auditBillToEcrMatching(tx, billId)
  // Verify cylinder counts, quantities match between bill and ECR
  ```

- [ ] **Add Audit page** to frontend (`frontend/src/pages/reports/AuditPage.js`)
  - Show unmatched bills ↔ ECR
  - Show orphaned holdings
  - Show rent discrepancies

---

## 📋 Upcoming (Weeks 2–3)

### 4. **WhatsApp Integration**
- [ ] **Choose provider** (recommend: Twilio for dev, Gupshup for prod)
- [ ] **Create `backend/src/services/whatsappService.js`**:
  ```javascript
  async sendBillNotification(customerId, billNumber, pdfUrl)
  async sendOverdueAlert(customerId, cylinderNumber, holdDays)
  ```
- [ ] **Hook into routes:**
  - `POST /bills` → send bill notification after creation
  - Overdue scheduler → send alert after 30 days

### 5. **GST PDF Generation**
- [ ] **Install library:** `npm install jspdf html2canvas`
- [ ] **Create `backend/src/services/invoiceService.js`**
  - Render HTML invoice template
  - Convert to PDF
  - Save to `/uploads/bills/CA-25-00001.pdf`
- [ ] **Add route:** `GET /bills/:id/pdf` → returns PDF stream

### 6. **Frontend Polish**
- [ ] Add filters to all list pages (status, date range, customer)
- [ ] Add bulk operations (multi-select, mass update)
- [ ] Add export to Excel/CSV on reports
- [ ] Add form validation feedback (error tooltips)
- [ ] Add print bill functionality

---

## 🔧 Technical Debt (Can Wait)

- [ ] Unit tests (Jest + Supertest)
- [ ] Integration tests for bill → challan → ECR flow
- [ ] Docker setup + docker-compose for local dev
- [ ] CI/CD pipeline (GitHub Actions or similar)
- [ ] Load testing (k6 or Apache JMeter)
- [ ] Security audit (OWASP, SQL injection, XSS checks)
- [ ] Performance profiling (slow queries, N+1 issues)

---

## 📊 Success Metrics

**Before Data Migration:**
- [ ] All API endpoints return 200 OK with mock data
- [ ] All React pages render without errors
- [ ] Rental calculation matches legacy FoxPro on test data
- [ ] Bill number generation follows XX/YY/NNNNN format

**After Data Migration:**
- [ ] 53K bills loaded and queryable
- [ ] 50K ECR records loaded
- [ ] 226 customers + 300 cylinders active
- [ ] Bill totals match legacy system reports
- [ ] Overdue detection works on historical data

**Before UAT:**
- [ ] Bill → Challan → ECR flow tested end-to-end
- [ ] Rent calculations verified against rate list
- [ ] Ledger entries post correctly
- [ ] WhatsApp notifications send on bill creation
- [ ] PDF invoices generate with correct GST

---

## 💬 Key Files to Review

| File | Purpose |
|------|---------|
| `backend/prisma/schema.prisma` | Database schema (15 tables) |
| `backend/src/services/rentalService.js` | 3-tier rental calculation (already works) |
| `backend/src/services/numberingService.js` | Bill number generation (XX/YY/NNNNN format) |
| `backend/src/routes/bills.js` | Bill creation endpoint |
| `backend/src/routes/ecr.js` | ECR creation endpoint |
| `frontend/src/pages/transactions/ChallansPage.js` | Challan UI |
| `PLAN.md` | Business logic reference |
| `emergent_prompt.md` | Scaffolding template (for future updates) |

---

## 🚨 Blockers & Risks

| Issue | Impact | Solution |
|-------|--------|----------|
| **Data migration not started** | Cannot test with real data; all features untested at scale | Start this week; build validation script first |
| **Holding logic incomplete** | Cannot properly track cylinder rentals; rent miscalculations | Finish cylinderHoldingService.js; write tests |
| **Reconciliation missing** | Cannot audit bill ↔ ECR matches; audit trail incomplete | Implement auditBillToEcrMatching() |
| **No WhatsApp** | Cannot notify customers; manual bill delivery needed | Add Twilio integration; test with sandbox |
| **No PDF generation** | Cannot send formal invoices; compliance risk | Add jsPDF + html2canvas |

---

## 📞 Contact Points

- **Patel & Company:**
  - Confirm data migration schedule
  - Prepare DBF file access
  - Define UAT timeline

- **Jubilee Glass Works:**
  - Clarify inter-company transfer business rules
  - Confirm cylinder ownership reconciliation

---

*Last Updated: April 16, 2026*
*Next Review: April 23, 2026*