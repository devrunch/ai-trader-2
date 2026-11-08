# Foundation

Shared application foundations support the API and web shell (SRD §10, §14;
AGENTS.md §7).

## Config
The API validates environment input once at startup (SRD §10.1, R-9).
`loadConfig` ignores unknown keys, applies defaults, parses ports and HTTP(S)
origins, and freezes the typed config. The global `APP_CONFIG` provider shares
that object. Invalid input produces one `ConfigError` listing every invalid key
with fixed descriptions that never include secret values (NFR-SC-1).

```mermaid
flowchart LR
  env --> loadConfig
  loadConfig --> AppConfig
  loadConfig --> ConfigError
  ConfigError --> exit[exit 1]
```

## Errors
Shared contracts define eleven stable codes and a strict error body (SRD ?11,
NFR-SC-1, AGENTS.md ?3). The API global filter emits only the public body;
unknown errors never expose messages, SQL or stacks. Pino receives structured warnings for domain errors and error codes for unexpected errors.

| Thrown value / HTTP status | Response status | Code | Message / details |
|---|---|---|---|
| DomainError | Declared status | Declared code | Declared message and optional details |
| ZodError | 422 | VALIDATION_FAILED | Validation failed; fields with dotted paths |
| HttpException 400, 422 | Same | VALIDATION_FAILED | Exception message |
| HttpException 401 | 401 | UNAUTHORIZED | Exception message |
| HttpException 403 | 403 | FORBIDDEN | Exception message |
| HttpException 404 | 404 | NOT_FOUND | Exception message |
| HttpException 409 | 409 | CONFLICT | Exception message |
| HttpException 429 | 429 | RATE_LIMITED | Exception message |
| HttpException 503 | 503 | UNAVAILABLE | Internal error |
| Other HttpException | Same | INTERNAL | Internal error for 5xx; otherwise exception message |
| Any other value | 500 | INTERNAL | Internal error; no details |

The filter reads request.id (unknown outside HTTP middleware). RateLimitedError sets Retry-After to ceil(retryAfterMs / 1000).

```mermaid
flowchart TD
  thrown[Thrown value] --> domain{DomainError?}
  domain -->|yes| declared[Declared status, code, message, details]
  domain -->|no| zod{ZodError?}
  zod -->|yes| fields[422 VALIDATION_FAILED with field details]
  zod -->|no| nest{HttpException?}
  nest -->|yes| mapped[Map status to code; redact 5xx message]
  nest -->|no| internal[500 INTERNAL; no details]
  declared --> response[Add requestId and send strict public body]
  fields --> response
  mapped --> response
  internal --> response
```

## Observability

NFR-OB-1, SRD ?11: global nestjs-pino emits JSON at APP_CONFIG.LOG_LEVEL.
The edge accepts a single request ID matching `[A-Za-z0-9_-]{1,64}` or generates
a UUID. Every response carries x-request-id. Authorization, cookie and set-cookie
headers are redacted. Bootstrap routes Nest logs through pino.

```mermaid
sequenceDiagram
  participant Client
  participant Edge as Pino middleware
  participant Handler
  participant Filter
  participant Log as JSON log
  Client->>Edge: Request with optional x-request-id
  Edge->>Edge: Resolve request.id and set response header
  Edge->>Handler: Request
  alt Handler throws
    Handler->>Filter: Exception
    Filter->>Log: Public code and requestId, bound req.id
    Filter-->>Client: Error body with same requestId
  else Handler succeeds
    Handler-->>Client: Response
  end
  Edge->>Log: Request completion with req.id
```

## Database
lands in T-0xx

## Resilience

The dependency-free `@aitrader/resilience` package provides full-jitter backoff
and retries (NFR-RB-1), circuit breaking (NFR-RB-2), abortable sleep and deadlines
(NFR-RB-3), and token-bucket rate limiting (NFR-SC-5). Clocks and randomness are
injectable. Retry callbacks use the zero-based failed attempt. Ignored breaker
errors pass through without counting; an ignored probe error releases the probe
slot and leaves the breaker half-open. Concurrent probe callers fail immediately
with zero remaining wait once the open interval has expired.

```mermaid
stateDiagram-v2
  [*] --> closed
  closed --> closed: Success resets consecutive failures
  closed --> open: Failure threshold reached
  open --> half_open: openMs elapsed
  half_open --> closed: Single probe succeeds
  half_open --> open: Probe fails / restart openMs
  half_open --> half_open: Probe busy or ignored error
```

## Redis
lands in T-0xx

## Health

NFR-RB-6: /health returns 200 without running dependencies. The global
ReadinessRegistry lets later modules register named checks without changing
health. Duplicate names throw. /ready runs checks in parallel with a per-check
2,000 ms default timeout; throws and timeouts return down with a reason capped
at 200 characters. Timers are cleared after completion. No checks means ready.
Timeout bounds waiting; the check interface does not support cancellation.

```mermaid
stateDiagram-v2
  [*] --> ok
  ok --> error: Any check down, throws or times out (503)
  error --> ok: All checks up on next request (200)
  ok --> ok: All checks up or none registered (200)
  error --> error: Any check remains down (503)
```

## Web shell
lands in T-0xx

## Live store
lands in T-0xx

## Diagram regeneration (SRD §14)

```mermaid
sequenceDiagram
  participant Developer
  participant Generator
  participant Reports
  Developer->>Generator: pnpm diagrams
  Generator->>Reports: Write classes, dependencies, knip and jscpd
  Developer->>Generator: pnpm diagrams:check
  Generator->>Reports: Hash, regenerate, hash
  Generator-->>Developer: Fail when generated content differs
```
