// Golden conversations and safety cases against the running assistant (P7-7). Needs the API up with a model configured.
//   node scripts/evals/agent-evals.mjs [baseUrl] [username] [password]
// Scores each case on the tools it called and the text it wrote; writes a JSON report to .superpowers/evals/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] ?? 'http://localhost:8000') + '/api';
const [, , , user = 'admin', password = 'admin123admin'] = process.argv;
const cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'));
const h = { 'content-type': 'application/json', 'x-requested-with': 'aitrader' };

const login = await fetch(`${base}/v1/auth/login`, { method: 'POST', headers: h, body: JSON.stringify({ username: user, password }) });
if (!login.ok) { console.error(`login failed: ${login.status}`); process.exit(2); }
const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const status = await fetch(`${base}/v1/agent/status`, { headers: { cookie } }).then(r => r.json());
if (!status.enabled) { console.error('assistant is not configured'); process.exit(2); }

async function turn(ask) {
  const res = await fetch(`${base}/v1/agent/chat`, { method: 'POST', headers: { ...h, cookie },
    body: JSON.stringify({ id: crypto.randomUUID(), message: { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: ask }] } }) });
  const tools = []; let text = ''; let buffer = ''; const notices = [];
  const reader = res.body.getReader(); const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n'); buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = frame.replace(/^data: /, ''); if (data === '[DONE]') continue;
      try { const c = JSON.parse(data);
        if (c.type === 'tool-input-available') tools.push(c.toolName);
        if (c.type === 'text-delta') text += c.delta;
        if (c.type === 'data-notice' || c.type === 'error') notices.push(c.data?.text ?? c.errorText);
      } catch { /* keep-alive or partial frame */ }
    }
  }
  return { status: res.status, tools, text, notices };
}

const regex = pattern => (pattern.startsWith('(?i)') ? new RegExp(pattern.slice(4), 'i') : new RegExp(pattern));
const results = [];
for (const c of cases) {
  const started = Date.now();
  const r = await turn(c.ask);
  const failures = [];
  if (r.status !== 200) failures.push(`HTTP ${r.status}`);
  for (const t of c.must ?? []) if (!r.tools.includes(t)) failures.push(`did not call ${t}`);
  for (const t of c.mustNot ?? []) if (r.tools.includes(t)) failures.push(`called ${t}`);
  if (c.text && !regex(c.text).test(r.text)) failures.push(`text did not match /${c.text}/`);
  if (/<｜/.test(r.text)) failures.push('model markup leaked into text');
  results.push({ id: c.id, pass: failures.length === 0, failures, tools: r.tools, ms: Date.now() - started, notices: r.notices, text: r.text.slice(0, 600) });
  console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}  ${c.id}  ${String(Date.now() - started).padStart(6)} ms  [${r.tools.join(', ')}]${failures.length ? '  ' + failures.join('; ') : ''}`);
}

if (cases.some(c => c.cleanupTasks)) {
  const tasks = await fetch(`${base}/v1/agent/tasks`, { headers: { cookie } }).then(r => r.json());
  for (const t of tasks.filter(t => t.state === 'active' || t.state === 'paused')) await fetch(`${base}/v1/agent/tasks/${t.id}/cancel`, { method: 'POST', headers: { ...h, cookie } });
}

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} passed · model ${status.model}`);
const out = join(here, '..', '..', '.superpowers', 'evals');
mkdirSync(out, { recursive: true });
const file = join(out, `agent-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), model: status.model, passed, total: results.length, results }, null, 2));
console.log(`report: ${file}`);
process.exit(passed === results.length ? 0 : 1);
