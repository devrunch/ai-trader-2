# Authentication

Implements username sign-in, role checks, admin account setup, and sliding Redis sessions. SRD: FR-AC-1, NFR-SC-1, NFR-SC-5.

## Login sequence

```mermaid
sequenceDiagram
  actor Owner
  participant Browser
  participant API
  participant Users as PostgreSQL users
  participant Hash as Argon2id
  participant Redis
  Browser->>API: POST /auth/login + X-Requested-With
  API->>Users: Find normalized username
  API->>Hash: Verify hash (dummy hash for unknown username)
  API->>Users: Increment failures or reset after success
  API->>Redis: Store random session, TTL 12h
  API-->>Browser: User JSON + HttpOnly SameSite=Strict cookie
```

## Session lifecycle

```mermaid
stateDiagram-v2
  [*] --> Active: successful login
  Active --> Active: /auth/me refreshes 12h TTL
  Active --> Deleted: logout
  Active --> Expired: TTL elapses
  Deleted --> [*]
  Expired --> [*]
```

## Lockout states

```mermaid
stateDiagram-v2
  [*] --> Available
  Available --> Available: failed attempt 1–4
  Available --> Locked: failed attempt 5
  Locked --> Locked: login rejected until 15m elapses
  Locked --> Available: lock expiry
  Available --> Available: successful login resets failures
```
