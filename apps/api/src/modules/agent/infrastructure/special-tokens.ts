// Some models (DeepSeek through Bedrock's OpenAI-compatible endpoint) leak their own markup, e.g. "<｜DSML｜function_calls", into text.
const TOKEN = /<｜[^｜]*｜[a-z_]*>?/g;
const OPEN = '<｜';

/** Strips model special tokens from streamed text. A token split across chunks is held back until it can be judged. */
export class SpecialTokenFilter {
  private carry = '';

  push(delta: string): string {
    const text = (this.carry + delta).replace(TOKEN, '');
    const open = text.lastIndexOf(OPEN);
    const partial = text.endsWith('<') ? text.length - 1 : open >= 0 && !/[\s.,!?]/.test(text.slice(open + OPEN.length)) ? open : -1;
    this.carry = partial >= 0 ? text.slice(partial) : '';
    return partial >= 0 ? text.slice(0, partial) : text;
  }

  /** Whatever is held back at the end of a text part is plain text after all. */
  flush(): string { const rest = this.carry.replace(TOKEN, ''); this.carry = ''; return rest; }
}
