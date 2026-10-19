import http from 'node:http';
import fs from 'node:fs';
const LOG = process.argv[2];
const RP = [
  'Ren growled low, his knot swelling as he came deep inside, flooding her again and again until her belly rounded.',
  'Ren poured the tea and watched the rain.',
  'Рен зарычал, его узел набух внутри, и он кончил, заливая её до краёв.',
];
let n = 0;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = body ? JSON.parse(body) : {};
    // ST may reshape roles (prompt post-processing), so look at the whole conversation.
    const isOoc = /You are the Cumometer/.test(JSON.stringify(j.messages || j.prompt || ''));
    fs.appendFileSync(LOG, JSON.stringify({ url: req.url, ooc: isOoc, auth: req.headers.authorization || req.headers['x-api-key'] || null, stream: !!j.stream, model: j.model, contract: /## Output/.test(JSON.stringify(j.messages || j.prompt || '')), all: isOoc ? JSON.stringify(j.messages) : undefined, roles: isOoc ? (j.messages || []).map((m) => m.role) : undefined }) + '\n');
    if (req.url.endsWith('/models')) { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-rp', object: 'model' }, { id: 'mock-ooc', object: 'model' }] })); }
    let content;
    if (isOoc) {
      const measured = j.messages.at(-2)?.content || '';
      const omega = /knot|узел/i.test(measured);
      const all = JSON.stringify(j.messages);
      if (/once more, groaning/.test(all)) {
        // First answer is chatter; only the corrective retry gets proper JSON.
        content = /not a valid answer/.test(all)
          ? '{"happened": true, "count": 1, "base": 4, "omega-pizdec": 7, "omegaverse": false, "comment": "Retry accepted."}'
          : 'Sure thing! He definitely finished there, I would say a moderate amount.';
      } else
      content = omega
        ? '{"happened": true, "count": 1, "base": 7.5, "omega-pizdec": 1840, "omegaverse": true, "comment": "Knot-sealed. The lab has upgraded from beakers to buckets."}'
        : '{"happened": false, "count": 0, "base": 0, "omega-pizdec": 0, "omegaverse": false, "comment": ""}';
    } else {
      const lastUser = [...(j.messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
      content = /ping/.test(lastUser) ? 'ok'
        : /Again/.test(lastUser) ? 'He came inside her again, flooding her with his seed.'
        : /Repeat/.test(lastUser) ? RP[0]
        : /Garble/.test(lastUser) ? 'He came inside her once more, groaning.'
        : /closer/.test(lastUser) ? RP[0]
        : /Смотрю/.test(lastUser) ? RP[2]
        : RP[1];
    }
    if (j.stream) {
      res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
      return res.end('data: [DONE]\n\n');
    }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: j.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
  });
}).listen(5100, '127.0.0.1', () => console.log('mock on 5100'));
