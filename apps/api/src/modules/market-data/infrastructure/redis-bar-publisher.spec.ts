import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisBarPublisher } from './redis-bar-publisher';
import { historyBar } from '../application/history.spec-helper';

describe('FR-LS-2 FR-LS-4 RedisBarPublisher', () => {
  let seq = 0;
  let published: string[];
  let list: string[];
  let redis: never;
  beforeEach(() => {
    seq = 0; published = []; list = [];
    const fake = { eval: vi.fn((_script: string, _keys: number, seqKey: string, channel: string, listKey: string, value: string) => {
      expect(seqKey).toBe('md:seq:NSE:TEST');
      expect(channel).toBe('md:bars:NSE:TEST');
      const update = JSON.parse(value) as { seq: number };
      update.seq = ++seq;
      const encoded = JSON.stringify({ ...JSON.parse(value), seq });
      published.push(encoded); list.unshift(encoded); list = list.slice(0, 300);
      expect(listKey).toBe('md:bars:history:NSE:TEST');
      return Promise.resolve([seq, encoded]);
    }) };
    redis = fake as never;
  });
  it('assigns strictly increasing seq per instrument starting at 1', async () => {
    const publisher = new RedisBarPublisher(redis, () => 1);
    await expect(publisher.publish('NSE:TEST', 'forming', historyBar)).resolves.toBe(1);
    await expect(publisher.publish('NSE:TEST', 'closed', historyBar)).resolves.toBe(2);
  });
  it('publishes the update JSON on the instrument channel', async () => {
    const publisher = new RedisBarPublisher(redis, () => 123);
    await publisher.publish('NSE:TEST', 'forming', historyBar);
    expect(JSON.parse(published[0] ?? '{}')).toMatchObject({ instrumentId: 'NSE:TEST', seq: 1, kind: 'forming', bar: historyBar, at: 123 });
  });
  it('keeps only the last 300 updates', async () => {
    const publisher = new RedisBarPublisher(redis, () => 1);
    for (let i = 0; i < 301; i++) await publisher.publish('NSE:TEST', 'forming', historyBar);
    expect(list).toHaveLength(300);
  });
});
