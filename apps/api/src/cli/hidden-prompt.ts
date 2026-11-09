import { Buffer } from 'node:buffer';

export async function readHidden(
  input: NodeJS.ReadableStream & { setRawMode?(enabled: boolean): void },
  output: NodeJS.WritableStream,
  question: string,
): Promise<string> {
  output.write(question);
  input.setRawMode?.(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      input.off('data', onData);
      input.setRawMode?.(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: unknown) => {
      const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : '';
      for (const character of text) {
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u0003') { finish(new Error('Cancelled')); return; }
        if (character === '\u007f' || character === '\b') value = Array.from(value).slice(0, -1).join('');
        else value += character;
      }
    };
    input.on('data', onData);
  });
}
