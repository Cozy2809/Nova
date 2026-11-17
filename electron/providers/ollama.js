// Proveedor Ollama con streaming NDJSON. Para añadir OpenAI/Anthropic/Gemini, crear un módulo con la misma firma
// stream({messages, settings, onChunk}) y registrarlo en registry.js
async function stream({ messages, settings, onChunk }) {
  const url = (settings.ollamaUrl || process.env.OLLAMA_API_URL || 'http://localhost:11434') + '/api/chat';
  const model = settings.model || process.env.OLLAMA_MODEL || 'qwen3:4b';
  let res;
  try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages, stream: true, think: false, options: { num_ctx: parseInt(settings.numCtx || process.env.OLLAMA_NUM_CTX, 10) || 4096, temperature: Number.isFinite(parseFloat(settings.temperature)) ? parseFloat(settings.temperature) : 0.5, repeat_penalty: 1.1 } }) }); }
  catch { throw new Error('No se pudo conectar con Ollama. ¿Está corriendo "ollama serve" en ' + url + '?'); }
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}. ¿Modelo "${model}" descargado? (ollama pull ${model})`);
  const dec = new TextDecoder(); let buf = '', full = '';
  for await (const part of res.body) {
    buf += dec.decode(part, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) { if (!l.trim()) continue; const t = JSON.parse(l).message?.content || ''; if (t) { full += t; onChunk(t); } }
  }
  return full;
}
module.exports = { stream };

