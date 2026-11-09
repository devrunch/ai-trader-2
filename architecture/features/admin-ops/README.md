# Zerodha connection (admin-ops + `shared/vendors/kite`)

**Purpose:** keep one valid Kite access token for the whole system without putting the owner's Zerodha account at risk.
**SRD:** FR-MD-5, E3, NFR-SC-1, FR-AC-2.

## Rules
- **Official Connect Zerodha is the primary path.** Scripted auto-login is off by default (`KITE_AUTO_LOGIN=false`) and is meant only for the server's static IP.
- **A CAPTCHA reply blocks all scripted logins for 24 h.** It is persisted, so a restart doesn't clear it. Only a verified official or manual connect clears it.
- **Scripted logins are capped** at 3 per 15 min and 6 per day, persisted in `vendor_sessions`.
- **Only the configured account is accepted.** A token from another Zerodha account is invalidated (best effort) and rejected with 400 `ACCOUNT_MISMATCH`; nothing is stored.
- **There is no API callback.** The session cookie is `SameSite=Strict` and isn't sent on Zerodha's cross-site redirect, so the web page `/admin/zerodha/callback` posts the token same-site.

## Connect flow
```mermaid
sequenceDiagram
  actor Owner
  participant Web as Web /admin
  participant Kite as kite.zerodha.com
  participant Cb as Web /admin/zerodha/callback
  participant API as POST /api/v1/admin/zerodha/token
  participant Svc as KiteSessionService
  participant DB as vendor_sessions
  Owner->>Web: Connect Zerodha
  Web->>Kite: open loginUrl (api_key)
  Owner->>Kite: log in + 2FA
  Kite-->>Cb: redirect ?request_token&status=success
  Cb->>Cb: strip token from URL (replaceState)
  Cb->>API: POST token (cookie + X-Requested-With)
  API->>Svc: connect(requestToken)
  Svc->>Kite: generateSession(token, secret)
  alt user_id matches configured account
    Svc->>DB: store token, clear CAPTCHA block
    API-->>Cb: 200 { connected, expiresAt }
  else another account
    Svc->>Kite: invalidate access token (best effort)
    API-->>Cb: 400 ACCOUNT_MISMATCH
  end
  Cb->>Web: navigate /admin + toast
```

## Scripted-login lock
```mermaid
stateDiagram-v2
  [*] --> Disabled: KITE_AUTO_LOGIN=false
  [*] --> Allowed: KITE_AUTO_LOGIN=true
  Allowed --> Allowed: login ok (attempt counted)
  Allowed --> CapReached: 3 per 15 min or 6 per day
  CapReached --> Allowed: window passes
  Allowed --> CaptchaBlocked: Zerodha replies CAPTCHA
  CaptchaBlocked --> Allowed: 24 h pass
  CaptchaBlocked --> Allowed: verified official connect
  Disabled --> Disabled: requests fail NOT_CONNECTED (no network call)
```
