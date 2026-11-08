# Foundation

Shared application foundations support the API and web shell (SRD §10, §14;
AGENTS.md §7). No foundation runtime flows exist yet.

## Config
lands in T-0xx

## Errors
lands in T-0xx

## Observability
lands in T-0xx

## Database
lands in T-0xx

## Redis
lands in T-0xx

## Health
lands in T-0xx

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
