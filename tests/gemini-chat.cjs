const {test} = require('node:test');
const assert = require('node:assert/strict');

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function fakeClient({user = {id: 'u1'}, authError = null, actorUser = {id: 'u1'}} = {}) {
  return () => ({
    auth: {
      getUser: async () => ({data: {user: authError ? null : user}, error: authError}),
      admin: {getUserById: async () => ({data: {user: actorUser}, error: null})}
    }
  });
}

const body = {contents: [{role: 'user', parts: [{text: '안녕하세요'}]}]};
const request = {method: 'POST', headers: {authorization: 'Bearer token'}, body};

test('gemini chat refuses to run without the server-side key', async () => {
  const {createGeminiChatHandler} = await import('../server/gemini-chat.mjs');
  const handler = createGeminiChatHandler({env: {}, createClient: fakeClient(), fetchImpl: async () => { throw new Error('should not call'); }});
  const res = fakeRes();
  await handler(request, res);
  assert.equal(res.statusCode, 503);
});

test('gemini chat requires a verified login before calling Gemini', async () => {
  const {createGeminiChatHandler} = await import('../server/gemini-chat.mjs');
  let called = false;
  const env = {GEMINI_API_KEY: 'server-key', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'secret'};
  const handler = createGeminiChatHandler({env, createClient: fakeClient({authError: {message: 'bad'}}), fetchImpl: async () => { called = true; }});
  const res = fakeRes();
  await handler(request, res);
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test('gemini chat sends the key in a header, keeps Korean instructions, and returns only text', async () => {
  const {createGeminiChatHandler} = await import('../server/gemini-chat.mjs');
  let sent;
  const env = {GEMINI_API_KEY: 'server-key', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'secret'};
  const fetchImpl = async (url, options) => {
    sent = {url, options};
    return {ok: true, json: async () => ({candidates: [{content: {parts: [{text: '답변입니다.'}]}}]})};
  };
  const handler = createGeminiChatHandler({env, createClient: fakeClient(), fetchImpl});
  const res = fakeRes();
  await handler(request, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {text: '답변입니다.'});
  assert.match(sent.url, /gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(sent.options.headers['x-goog-api-key'], 'server-key');
  assert.doesNotMatch(sent.options.body, /server-key/);
  assert.match(JSON.parse(sent.options.body).systemInstruction.parts[0].text, /한국어/);
});

test('gemini chat rejects banned accounts and malformed conversation history', async () => {
  const {createGeminiChatHandler} = await import('../server/gemini-chat.mjs');
  const env = {GEMINI_API_KEY: 'server-key', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'secret'};
  const banned = createGeminiChatHandler({env, createClient: fakeClient({actorUser: {id: 'u1', banned_until: '2999-01-01T00:00:00Z'}}), fetchImpl: async () => { throw new Error('no'); }});
  const bannedRes = fakeRes();
  await banned(request, bannedRes);
  assert.equal(bannedRes.statusCode, 403);

  const bad = createGeminiChatHandler({env, createClient: fakeClient(), fetchImpl: async () => { throw new Error('no'); }});
  const badRes = fakeRes();
  await bad({...request, body: {contents: [{role: 'model', parts: [{text: '앞선 답변'}]}]}}, badRes);
  assert.equal(badRes.statusCode, 400);
});
