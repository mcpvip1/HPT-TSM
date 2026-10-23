# Security Specification: Temperature Test Report Pro

## 1. Data Invariants
1. **Report Ownership & Identity**: Every Report document must have `userId` matching `request.auth.uid`. A user cannot forge reports under another user's UID.
2. **Lot Number Integrity**: `lotNumber` must be a valid non-empty string under 100 characters.
3. **Threshold Bounds**: `minThreshold` and `maxThreshold` must be numeric values, where `minThreshold < maxThreshold` and plausible (e.g. between 0 and 100°C).
4. **Temporal Invariant**: `createdAt` on creation must match `request.time`. On updates, `createdAt` is immutable and `updatedAt` must match `request.time`.
5. **PII Isolation**: User profile under `/users/{userId}` is strictly readable and writable only by the authenticated owner (`request.auth.uid == userId`).
6. **Query Containment**: When querying reports, only reports where `userId == request.auth.uid` are allowed, preventing cross-user report scraping.

## 2. The Dirty Dozen Attack Payloads
1. **Unauthenticated Write**: Creating a report without any Firebase Auth credential. -> Reject (403 PERMISSION_DENIED)
2. **Identity Spoofing**: User A attempts to write a report with `userId = "user_B"`. -> Reject (403 PERMISSION_DENIED)
3. **Path Variable ID Poisoning**: Document ID with invalid characters or > 128 characters (e.g., `../../../root`). -> Reject (403 PERMISSION_DENIED)
4. **Shadow Field Injection**: Incoming report containing arbitrary unauthorized admin field `isAdmin: true` or `verified: true`. -> Reject (403 PERMISSION_DENIED)
5. **Denial of Wallet Payload**: 5MB string injected into `lotNumber` or `fileName`. -> Reject (403 PERMISSION_DENIED)
6. **Time Travel / Forged Timestamp**: Setting `createdAt` to a historical or future timestamp rather than `request.time`. -> Reject (403 PERMISSION_DENIED)
7. **Immutable Field Tampering**: Updating a report to mutate `createdAt` or transfer `userId` to another user. -> Reject (403 PERMISSION_DENIED)
8. **Invalid Data Type**: Sending a boolean for `minThreshold` or an array for `lotNumber`. -> Reject (403 PERMISSION_DENIED)
9. **Cross-Tenant Document Read**: User B attempting `get` on `/reports/{reportId}` owned by User A. -> Reject (403 PERMISSION_DENIED)
10. **Blanket Query Scraping**: Running `collection(db, 'reports')` without matching `where("userId", "==", auth.uid)`. -> Reject (403 PERMISSION_DENIED)
11. **Profile Hijacking**: User A attempting to update `/users/user_B`. -> Reject (403 PERMISSION_DENIED)
12. **Extreme Threshold Inversion**: Submitting `minThreshold = 50` and `maxThreshold = 20`. -> Reject (403 PERMISSION_DENIED)
