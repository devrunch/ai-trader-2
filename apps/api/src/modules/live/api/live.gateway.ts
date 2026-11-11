import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type DefaultEventsMap, type Socket } from 'socket.io';
import type { CurrentUser } from '../../auth/application/index';
import type { LiveIndicators } from '../application/live-indicators';
import type { LiveSubscriptions } from '../application/live-subscriptions';
import { LiveAckSchema } from '@aitrader/contracts';

interface GatewayOptions { sessionCheckMs?: number; warn?: (message: string) => void; now?: () => number }
interface SocketData { userId?: string; sessionId?: string }
type AuthenticatedSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export class LiveGateway {
  private io: SocketServer | undefined;
  private readonly sessions = new Map<string, ReturnType<typeof setInterval>>();
  private readonly users = new Map<string, Set<string>>();
  private readonly sessionCheckMs: number;
  private readonly warn: (message: string) => void;
  private readonly now: () => number;
  constructor(private readonly currentUser: Pick<CurrentUser, 'execute'>, options: GatewayOptions = {}, private readonly streams?: LiveSubscriptions,
    private readonly indicators?: LiveIndicators) {
    this.sessionCheckMs = options.sessionCheckMs ?? 5 * 60_000;
    this.warn = options.warn ?? (message => { process.emitWarning(message); });
    this.now = options.now ?? Date.now;
  }

  attach(server: HttpServer): void {
    const io = new SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>(server, { path: '/api/socket.io', transports: ['websocket', 'polling'], allowEIO3: false });
    this.io = io;
    io.use((socket, next) => {
      const sessionId = readSessionCookie(socket.handshake.headers.cookie);
      void this.currentUser.execute(sessionId).then(user => {
        if (!user || !sessionId) { next(unauthorized()); return; }
        socket.data.userId = user.id;
        socket.data.sessionId = sessionId;
        const sockets = this.users.get(user.id) ?? new Set<string>();
        if (sockets.size >= 10) { next(Object.assign(new Error('Socket limit exceeded'), { data: { code: 'LIMIT' } })); return; }
        sockets.add(socket.id); this.users.set(user.id, sockets);
        next();
      }).catch((error: unknown) => { this.warn(`Socket authentication failed: ${errorName(error)}`); next(unauthorized()); });
    });
    io.on('connection', socket => { this.connected(socket); });
  }

  /** Sends to one socket by id; used by live indicators, which are shared across sockets. */
  emitTo(socketId: string, event: string, payload: unknown): void { this.io?.sockets.sockets.get(socketId)?.emit(event, payload); }

  async close(): Promise<void> {
    for (const timer of this.sessions.values()) clearInterval(timer);
    this.sessions.clear();
    this.users.clear();
    const io = this.io;
    this.io = undefined;
    if (io) {
      const streams = this.streams;
      if (streams) await Promise.all([...io.sockets.sockets.keys()].map(socketId => streams.disconnect(socketId)));
      await io.close();
    }
  }

  private connected(socket: AuthenticatedSocket): void {
    const userId = socket.data.userId;
    if (!userId) { socket.disconnect(true); return; }
    this.streams?.connect(socket.id, userId, (event, payload) => {
      if (event === 'bar' && this.bufferedBytes(socket) > 1_000_000) return false;
      socket.emit(event, payload); return true;
    });
    socket.on('subscribe', (value: unknown, ack: (result: unknown) => void) => {
      if (typeof ack !== 'function' || !this.streams) return;
      void this.streams.subscribe(socket.id, value).then(ack).catch((error: unknown) => {
        this.warn(`Live subscribe failed: ${errorName(error)}`);
        ack(LiveAckSchema.parse({ ok: false, code: 'INVALID', message: 'Subscription failed' }));
      });
    });
    // E14: clients measure their clock offset from this; bar boundaries stay server-side.
    socket.on('time', (ack: unknown) => { if (typeof ack === 'function') (ack as (reply: { now: number }) => void)({ now: this.now() }); });
    socket.on('subscribeIndicators', (value: unknown, ack: (result: unknown) => void) => {
      if (typeof ack !== 'function' || !this.indicators) return;
      void this.indicators.subscribe(socket.id, value).then(ack).catch((error: unknown) => {
        this.warn(`Live indicator subscribe failed: ${errorName(error)}`);
        ack({ ok: false, code: 'UNAVAILABLE', message: 'Indicators unavailable' });
      });
    });
    socket.on('unsubscribeIndicators', (value: unknown) => { this.indicators?.unsubscribe(socket.id, value); });
    socket.on('unsubscribe', (value: unknown) => { if (this.streams) void this.streams.unsubscribe(socket.id, value).catch((error: unknown) => { this.warn(`Live unsubscribe failed: ${errorName(error)}`); }); });
    const timer = setInterval(() => { void this.checkSession(socket).catch((error: unknown) => { this.warn(`Socket session check failed: ${errorName(error)}`); }); }, this.sessionCheckMs);
    this.sessions.set(socket.id, timer);
    socket.once('disconnect', () => {
      clearInterval(timer); this.sessions.delete(socket.id);
      const userSockets = this.users.get(userId); userSockets?.delete(socket.id); if (userSockets?.size === 0) this.users.delete(userId);
      if (this.streams) void this.streams.disconnect(socket.id).catch((error: unknown) => { this.warn(`Live disconnect cleanup failed: ${errorName(error)}`); });
    });
  }

  private async checkSession(socket: AuthenticatedSocket): Promise<void> {
    const user = await this.currentUser.execute(socket.data.sessionId);
    if (user) return;
    socket.emit('session_expired');
    socket.disconnect(true);
  }

  private bufferedBytes(socket: AuthenticatedSocket): number {
    const transport: unknown = socket.conn.transport;
    if (typeof transport === 'object' && transport !== null && 'socket' in transport) {
      const underlying: unknown = transport.socket;
      if (typeof underlying === 'object' && underlying !== null && 'bufferedAmount' in underlying) {
        const amount: unknown = underlying.bufferedAmount;
        if (typeof amount === 'number') return amount;
      }
    }
    const connection: unknown = socket.conn;
    if (typeof connection !== 'object' || connection === null || !('writeBuffer' in connection) || !Array.isArray(connection.writeBuffer)) return 0;
    const packets: unknown[] = connection.writeBuffer;
    return packets.reduce<number>((total, packet) => total + JSON.stringify(packet).length, 0);
  }
}

function readSessionCookie(header: string | undefined): string | undefined {
  const pair = header?.split(';').map(value => value.trim()).find(value => value.startsWith('aitrader_session='));
  if (!pair) return undefined;
  const value = pair.slice('aitrader_session='.length);
  try { return decodeURIComponent(value) || undefined; } catch { return undefined; }
}

function unauthorized(): Error & { data: { code: 'UNAUTHORIZED' } } {
  return Object.assign(new Error('Unauthorized'), { data: { code: 'UNAUTHORIZED' as const } });
}

function errorName(error: unknown): string { return error instanceof Error ? error.name : 'UnknownError'; }
