// Some models (DeepSeek through Bedrock's OpenAI-compatible endpoint) leak their own markup, e.g. "<｜DSML｜function_calls", into text.
const OPEN = '<｜';
const BAR = '｜';
const NAME = /^[a-z_]*>?/;

/** Strips model special tokens from streamed text. A token that may continue in the next chunk is held back until it can be judged. */
export class SpecialTokenFilter {
  private carry = '';

  push(delta: string): string {
    let text = this.carry + delta;
    this.carry = '';
    let out = '';
    for (;;) {
      const start = text.indexOf(OPEN);
      if (start < 0) break;
      out += text.slice(0, start);
      const bar = text.indexOf(BAR, start + OPEN.length);
      if (bar < 0) { this.carry = text.slice(start); return out; }
      const name = NAME.exec(text.slice(bar + BAR.length))?.[0] ?? '';
      const end = bar + BAR.length + name.length;
      // The name may still be arriving: wait for a character that ends it.
      if (end === text.length) { this.carry = text.slice(start); return out; }
      text = text.slice(end);
    }
    if (text.endsWith('<')) { this.carry = '<'; return out + text.slice(0, -1); }
    return out + text;
  }

  /** At the end of a text part, a held "<" is plain text; a held marker is dropped. */
  flush(): string { const rest = this.carry === '<' ? '<' : ''; this.carry = ''; return rest; }
}
