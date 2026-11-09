# Live socket gateway

**Purpose:** provide authenticated, replayable live market data with expiring subscription interest.

**SRD:** FR-LS-1, FR-LS-2, FR-LS-4, E10, E11, E16, E24, NFR-SC-1, NFR-RB-1.

```mermaid
sequenceDiagram
    participant C as Client
    participant G as Gateway
    participant R as Redis
    participant S as Sequence store
    participant M as Market data
    C->>G: subscribe(symbol, interval, afterSeq?)
    G->>R: subscribe md:bars channel (buffer)
    G->>R: acquire expiring lease
    G->>S: current seq0
    G->>M: read recent bars and status
    G-->>C: snapshot(seq0)
    G-->>C: buffered updates where seq > seq0
    R-->>G: numbered updates
    alt sequence gap or upstream reconnect
        G-->>C: resync(reason)
        C->>G: subscribe(afterSeq)
    else contiguous update
        G-->>C: bar(seq)
    end
```

The server uses one pattern subscribed Redis connection per API process. Active instrument leases are ZSET entries named `<instanceId>|<instrumentId>` and expire after 60 seconds; the process refreshes them every 20 seconds. `subscribe` and `unsubscribe` are strict Zod payloads and are rate limited to 20 operations per 10 seconds per socket. Each socket can hold 50 subscriptions and each user can hold 10 sockets. A slow transport over 1 MB receives one resync event while pending bar events are discarded.

```mermaid
stateDiagram-v2
    [*] --> Buffering: subscribe
    Buffering --> Live: snapshot sent and buffered updates flushed
    Live --> ResyncRequired: gap, reconnect, or slow consumer
    ResyncRequired --> Buffering: client resubscribes with afterSeq
    Buffering --> Closed: unsubscribe or disconnect
    Live --> Closed: unsubscribe or disconnect
    Closed --> [*]
```
