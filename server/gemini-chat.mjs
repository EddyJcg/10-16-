const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';
const SYSTEM_PROMPT = '당신은 업무를 돕는 AI 비서 isummerly입니다. 모든 답변은 항상 한국어로 작성하세요.';
const MAX_TURNS = 20;
const MAX_TEXT_LENGTH = 4000;

const banned = user => user.banned_until && new Date(user.banned_until).getTime() > Date.now();

function parseContents(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) return null;
  const contents = [];
  for (const turn of value) {
    if (!turn || typeof turn !== 'object' || !['user', 'model'].includes(turn.role)) return null;
    const text = turn.parts?.[0]?.text;
    if (!Array.isArray(turn.parts) || turn.parts.length !== 1 || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return null;
    contents.push({ role: turn.role, parts: [{ text: trimmed }] });
  }
  if (contents[contents.length - 1].role !== 'user') return null;
  return contents.slice(-MAX_TURNS);
}

export function createGeminiChatHandler({fetchImpl = fetch, createClient, env = process.env}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, message) => res.status(status).json({error: message});
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return reply(405, '지원하지 않는 요청입니다.');
    }
    const geminiKey = env.GEMINI_API_KEY;
    const url = env.SUPABASE_URL;
    const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    if (!geminiKey || !url || !secret) return reply(503, '챗봇 서버 환경변수(GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY) 설정이 필요합니다.');
    const match = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization || '');
    if (!match) return reply(401, '로그인이 필요합니다.');

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return reply(400, '잘못된 요청입니다.'); }
    const contents = parseContents(body?.contents);
    if (!contents) return reply(400, '대화 내용이 올바르지 않습니다.');

    try {
      const client = createClient(url, secret, {auth: {persistSession: false, autoRefreshToken: false}});
      const {data: auth, error: authError} = await client.auth.getUser(match[1]);
      if (authError || !auth?.user) return reply(401, '로그인 세션이 만료되었습니다.');
      const {data: actor, error: actorError} = await client.auth.admin.getUserById(auth.user.id);
      if (actorError || !actor?.user || actor.user.deleted_at || banned(actor.user)) {
        return reply(403, '사용할 수 없는 계정입니다.');
      }

      const geminiResponse = await fetchImpl(GEMINI_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'x-goog-api-key': geminiKey},
        body: JSON.stringify({
          systemInstruction: {parts: [{text: SYSTEM_PROMPT}]},
          contents
        })
      });
      if (!geminiResponse.ok) return reply(502, 'AI 응답을 가져오지 못했습니다. 잠시 후 다시 시도하세요.');
      const data = await geminiResponse.json();
      const text = (data?.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('').trim();
      if (!text) return reply(502, 'AI가 응답을 만들지 못했습니다. 다시 질문해 주세요.');
      return res.status(200).json({text});
    } catch {
      return reply(502, 'AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.');
    }
  };
}
