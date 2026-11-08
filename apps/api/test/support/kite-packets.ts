export function kitePacket(length: number, token: number, fields: readonly (readonly [number, number])[]): Buffer {
  const packet = Buffer.alloc(length); packet.writeUInt32BE(token, 0);
  for (const [offset, value] of fields) {
    if (value < 0) packet.writeInt32BE(value, offset);
    else packet.writeUInt32BE(value, offset);
  }
  return packet;
}
export function encodeKitePackets(packets: readonly Buffer[]): ArrayBuffer {
  const count = Buffer.alloc(2); count.writeUInt16BE(packets.length);
  const chunks: Buffer[] = [count];
  for (const packet of packets) {
    const length = Buffer.alloc(2); length.writeUInt16BE(packet.length); chunks.push(length, packet);
  }
  return Uint8Array.from(Buffer.concat(chunks)).buffer;
}
