# Cloud Functions Setup (Stock Automation)

This folder contains Firebase Cloud Functions scaffold for:

- Monthly month-end stock snapshot automation (`monthEndSnapshot`)
- Unlock ripple recalculation callable function (`recalculateSnapshotsFromMonth`)

## Deploy Notes

1. Install Firebase CLI and login.
2. Run `npm install` inside `functions/`.
3. Ensure project has billing-enabled scheduler support.
4. Deploy with:
   - `npm run deploy`

## Trigger Behaviors

- `monthEndSnapshot`
  - Schedule: `59 23 L * *`
  - Timezone: `Asia/Kolkata`
  - Writes to `monthly_stock_snapshots`

- `recalculateSnapshotsFromMonth`
  - Callable function for admin unlock flow
  - Input: `{ month: "YYYY-MM", reason: "..." }`
  - Writes unlock audit logs to `stock_unlock_audit_logs`
  - Rebuilds snapshots from the unlocked month to current month

## Next Hardening Tasks

- Add Firebase Auth admin validation for callable endpoint.
- Add idempotency lock key per month to avoid concurrent recalculation.
- Add structured error log documents for failed runs.
