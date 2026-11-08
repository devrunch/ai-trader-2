import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { encodeKitePackets, kitePacket } from './kite-packets';

function fullTick(token: number, at: number, price: number, volume: number): Buffer {
  return Buffer.from(encodeKitePackets([kitePacket(184, token, [[4, Math.round(price * 100)], [16, volume],
    [44, Math.floor(at / 1000)], [60, Math.floor(at / 1000)]])]));
}
export async function kiteSocket(rejectAuth = false) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1', verifyClient: () => !rejectAuth }); await once(server, 'listening');
  const address = server.address(); if (typeof address === 'string' || !address) throw new Error('Missing socket address');
  let connections = 0; const commands: unknown[] = []; const urls: string[] = [];
  server.on('connection', (socket, request) => { connections++; urls.push(request.url ?? ''); socket.on('message', data => {
    const bytes = Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? Buffer.from(data) : data;
    commands.push(JSON.parse(bytes.toString('utf8')));
  }); });
  // Protocol heartbeats demonstrate socket liveness without generating market ticks.
  const heartbeat = setInterval(() => { for (const socket of server.clients) socket.send(Buffer.from([0])); }, 1000);
  return { root: `ws://127.0.0.1:${String(address.port)}/`, commands, urls, count: () => connections,
    binary: (value: ArrayBuffer) => { for (const socket of server.clients) socket.send(value); },
    heartbeat: () => { for (const socket of server.clients) socket.send(Buffer.from([0])); },
    text: (value: unknown) => { for (const socket of server.clients) socket.send(JSON.stringify(value)); },
    tick: (at: number, price: number, volume: number) => { for (const socket of server.clients) socket.send(fullTick(256001, at, price, volume)); },
    kill: () => { for (const socket of server.clients) socket.terminate(); },
    stop: async () => { clearInterval(heartbeat); for (const socket of server.clients) socket.terminate(); await new Promise<void>(resolve => { server.close(() => { resolve(); }); }); },
  };
}
