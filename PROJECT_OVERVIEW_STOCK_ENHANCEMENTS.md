# SMVS Stock App - Full Project Overview and Enhancement Plan

## 1) Project Overview

આ પ્રોજેક્ટ React + Vite આધારિત Stock Management SPA છે, જેમાં મુખ્ય data store તરીકે Firebase Firestore વપરાય છે. હાલ સિસ્ટમ inventory, order/request, send/dispatch, purchase, stock ledger અને monthly/yearly reporting પૂરું કરે છે.

Core objective:
- Center અને Kothar વચ્ચેનું stock movement track કરવું
- Item-wise IN/OUT transactions maintain કરવું
- Monthly/Yearly reports generate કરી share/PDF/email કરવું

## 2) Current Tech and Architecture

- Frontend: React (`src/App.jsx`) + Vite
- Styling/UI: Tailwind CSS, Framer Motion
- Database: Firebase Firestore (`src/firebase.js`)
- File/PDF Integration: external PDF API (`src/pdfClient.js`)
- Email Sharing: EmailJS (inside app flows)
- Architecture style: Single-page app with central business logic in `src/App.jsx` + report computation in `src/reporting.js`

Important note:
- In-repo backend/cron service હાજર નથી. એટલે scheduled jobs માટે separate backend (Cloud Function / cron service) ઉમેરવું જરૂરી છે.

## 3) Current Modules (Implemented)

### A. Authentication
- Firestore `users` collection પરથી username/password ચેક
- Admin/User view switching

### B. Item & Category Management
- Item add/edit/deactivate/reactivate
- Item category handling

### C. Orders / Requests (Stock OUT)
- User side order entry
- Admin review અને processing
- Share/PDF/email support

### D. Send Orders / Dispatch (Stock IN to centers)
- Dispatch entries and chalan flow
- Share/PDF/email support

### E. Purchases / Kothar Stock Entry
- Purchase entries with item-wise quantities
- Shop name handling and stock update

### F. Stock Ledger
- Normalized `stock-transactions` collection
- Source-wise transaction capture (`IN`/`OUT`)
- Soft delete pattern (`is_deleted`) used in multiple modules

### G. Reporting
- Monthly/Yearly reports
- Center-wise / all-center modes
- Existing monthly closing logic available in reporting utilities

## 4) Data Model Snapshot (Current)

Main Firestore collections currently in use:
- `users`
- `items`
- `item-categories`
- `orders`
- `send-orders`
- `purchases`
- `stock-transactions`
- `monthly-closing-stock`
- `global-stock`
- `reports`
- `purchase-shop-names`

Design pattern:
- Aggregations mostly runtime/client-side calculate થાય છે.
- Historical accuracy માટે closing data persist કરવાની શરૂઆત already છે (`monthly-closing-stock`), but full lock/unlock workflow complete નથી.

## 5) Your Requested New Functionalities - Best Design Suggestion

નીચે 4 requirements માટે production-friendly approach:

---

### 5.1 Monthly Stock Snapshot Architecture

#### Goal
દર મહિને end પર item-wise locked snapshot generate થાય જેથી historical report instant અને accurate બને.

#### Recommended collection
`monthly_stock_snapshots`

Suggested fields:
- `snapshot_id` (e.g. `2026-04_item123`)
- `month` (1-12)
- `year`
- `item_id`
- `item_name`
- `opening_balance`
- `total_inward`
- `total_outward`
- `closing_balance`
- `is_locked` (default true)
- `locked_at`
- `lock_source` (`cron` / `manual`)
- `recalc_version` (integer, ripple updates track કરવા)
- `updated_at`

#### Scheduler design
- Preferred: Firebase Cloud Scheduler + Cloud Function (or trusted backend cron)
- Run time: Month-end 11:59 PM local timezone (IST clearly set કરવું)
- Rule: idempotent execution (same month for same item duplicate ન થાય)

#### Reporting behavior change
- Past locked month report માટે `stock-transactions` scan ના કરો
- Direct `monthly_stock_snapshots` પરથી fetch
- Current running month માટે dynamic calculation allow કરો

#### Benefit
- Fast reports
- Immutable monthly history
- Operational consistency

---

### 5.2 Unlock + Ripple Recalculation (Backdated Entry Impact)

#### Goal
જો past month unlock થાય અને backdated change થાય તો આગળના બધા મહિનાના balances auto-fix થાય.

#### Recommended flow
1. Admin unlock request submit કરે (reason required)
2. Target month snapshot status `is_locked = false`
3. Backdated entries/edits allow
4. Recalculation job trigger:
   - Start from unlocked month
   - Recompute month-by-month till latest month
   - Each month opening = previous month closing
   - Update snapshots with incremented `recalc_version`
5. Month ફરી lock કરો

#### Safety controls
- Recalc run transactional/batched હોવો જોઈએ
- Partial failure માટે `recalc_status` maintain કરો
- Retry-safe execution (job rerunથી data corrupt ન થાય)

#### Why this is best
- Accounting continuity maintain થાય
- Manual spreadsheet fixes ટળે
- Transparent correction chain બને

---

### 5.3 Unlock Audit Trail

#### Goal
એક admin હોવા છતાં unlock history traceable હોવી જોઈએ.

#### Recommended collection
`stock_unlock_audit_logs`

Suggested fields:
- `audit_id`
- `month`
- `year`
- `reason`
- `unlocked_by`
- `unlocked_at`
- `relocked_at`
- `affected_from_month`
- `affected_to_month`
- `recalc_run_id`
- `recalc_status` (`queued`/`running`/`success`/`failed`)
- `notes`

#### UX rule
- Unlock button click થાય ત્યારે Reason mandatory popup
- Empty reason reject કરો

#### Reporting/Audit screen
- Simple table: Month, Reason, By, DateTime, Recalc Status
- CSV export optional (later phase)

---

### 5.4 Physical Stock Adjustment (Reconciliation)

#### Goal
જૂના transactions બદલીયા વગર stock mismatch fix કરવો.

#### Recommended approach
- New transaction source type: `physical_adjustment`
- Existing `stock-transactions` collectionમાં entry insert કરો
- Quantity can be plus/minus
- Mandatory reason tag:
  - `Shrinkage`
  - `Damage`
  - `Missing`
  - `Found / Correction` (optional but useful)

Suggested fields:
- `sourceType: "physical_adjustment"`
- `transaction_type: "IN" | "OUT"`
- `quantity`
- `item_id`, `item_name`
- `center_id` (if applicable)
- `transaction_date`
- `adjustment_reason`
- `remark`
- `created_by`
- `created_at`

#### Why this is correct
- Ledger integrity જળવાય
- Audit trail clean રહે
- Financial and physical reconciliation બંને શક્ય બને

## 6) What to Do First (Priority Plan)

### Phase 1 (Must-have foundation)
1. Snapshot schema final કરો (`monthly_stock_snapshots`)
2. Past report read-path snapshot આધારિત કરો
3. Manual "Run Month Close" admin action add કરો

### Phase 2 (Control + compliance)
4. Unlock flow + mandatory reason
5. Audit log collection + admin history view

### Phase 3 (Data correctness automation)
6. Ripple recalculation engine build કરો
7. Recalc job state tracking + retry logic

### Phase 4 (Operational reconciliation)
8. Physical adjustment entry screen add કરો
9. Adjustment records reportingમાં include કરો

## 7) Additional Improvements (Biju Saru Shu Kari Sakai?)

તમારી હાલની requirements સિવાય નીચેના સુધારાઓ long-term ખૂબ useful રહેશે:

- Authentication hardening:
  - Client-side plain password check દૂર કરો
  - Firebase Auth અથવા secure server-validated auth અપનાવો
- Role separation (future-ready):
  - આજે single admin છે, પણ auditor/viewer role future માટે scaffold રાખો
- Stock negative prevention:
  - OUT transaction સમયે item-level balance validation
- Concurrency protection:
  - Same item માટે parallel writes avoid કરવા batched/transaction writes
- Backup/export:
  - Monthly snapshot auto-export (CSV/JSON) for compliance
- Alerting:
  - Low stock threshold alerts
  - Recalc failure alerts (email/notification)
- Performance:
  - Firestore composite indexes for month/year/item queries
- Observability:
  - Job run logs + error dashboard

## 8) Suggested Implementation in Current Codebase

Current project structure મુજબ best practical integration:

- `src/reporting.js`
  - Snapshot calculation utilities extend કરો
  - Recalc pipeline pure functions form માં લખો

- `src/App.jsx`
  - Admin UI:
    - Month lock/unlock controls
    - Unlock reason modal
    - Physical adjustment form
    - Audit history section
  - Report generation path:
    - Past month => snapshot reads
    - Current month => live calculation

- New backend layer (recommended)
  - Cloud Function for scheduled month-close
  - Callable endpoint for ripple recalculation

## 9) Risks and Mitigation

- Risk: Client-only cron not reliable  
  Mitigation: Server-side scheduler only

- Risk: Backdated edits causing chain inconsistency  
  Mitigation: Mandatory ripple recalculation + versioned snapshots

- Risk: Silent data changes  
  Mitigation: mandatory reason + immutable audit entries

- Risk: Human error in adjustments  
  Mitigation: reason tags + remarks + report visibility

## 10) Final Recommendation (Actionable)

Immediate actionable next step:
1. Snapshot + audit log data contracts finalize કરો
2. Past report read logic snapshot-first કરો
3. Unlock + physical adjustment UI implement કરો
4. પછી scheduler + ripple automation જોડો

---

જો તમે કહો તો next step માં હું આ દસ્તાવેજ પ્રમાણે actual implementation શરૂ કરી દઉં:
- Firestore schema constants
- Unlock/Audit મોડ્યુલ
- Physical Adjustment form
- Snapshot-first reporting switch
