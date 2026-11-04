const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const banned = user => user.banned_until && new Date(user.banned_until).getTime() > Date.now();

export function createUserActivityHandler({createClient,env = process.env}) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const reply = (status,message) => res.status(status).json({error:message});
    if (!['GET','POST'].includes(req.method)) {
      res.setHeader('Allow','GET, POST'); return reply(405,'지원하지 않는 요청입니다.');
    }
    const url = env.SUPABASE_URL;
    const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    const admins = new Set((env.ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(id => UUID.test(id)));
    if (!url || !secret || !admins.size) return reply(503,'사용자 활동 기록을 위한 Vercel 환경변수 설정이 필요합니다.');
    const match = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization || '');
    if (!match) return reply(401,'로그인이 필요합니다.');
    try {
      const client = createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data:auth,error:authError} = await client.auth.getUser(match[1]);
      if (authError || !auth?.user) return reply(401,'로그인 세션이 만료되었습니다.');
      const actorId = auth.user.id;

      if (req.method === 'POST') {
        let body;
        try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
        catch { return reply(400,'잘못된 요청입니다.'); }
        if (!body || Array.isArray(body) || typeof body !== 'object'
          || Object.keys(body).some(key => key !== 'event_type')
          || !['login','logout'].includes(body.event_type)) return reply(400,'로그인 또는 로그아웃 기록만 등록할 수 있습니다.');
        const {data:actor,error:actorError} = await client.auth.admin.getUserById(actorId);
        if (actorError || !actor?.user || actor.user.deleted_at || banned(actor.user)
          || (!admins.has(actorId) && actor.user.app_metadata?.inventory_access !== true)) {
          return reply(403,'활성 사용자만 활동을 기록할 수 있습니다.');
        }
        const {data,error} = await client.from('user_auth_activity')
          .insert({user_id:actorId,email:auth.user.email || actor.user.email || '',event_type:body.event_type})
          .select('id,user_id,email,event_type,occurred_at').single();
        if (error || !data) return reply(502,'로그인 이력을 저장하지 못했습니다. DB 마이그레이션 상태를 확인하세요.');
        return res.status(201).json({event:data});
      }

      if (!admins.has(actorId)) return reply(403,'관리자만 로그인 이력을 조회할 수 있습니다.');
      const {data:admin,error:adminError} = await client.auth.admin.getUserById(actorId);
      if (adminError || !admin?.user || banned(admin.user)) return reply(403,'사용할 수 없는 관리자 계정입니다.');
      const page = Number(req.query?.page || 1);
      const user = typeof req.query?.user === 'string' ? req.query.user.trim() : '';
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || user.length > 254) {
        return reply(400,'검색 조건이 올바르지 않습니다.');
      }
      const from = (page - 1) * 100;
      let query = client.from('user_auth_activity')
        .select('id,user_id,email,event_type,occurred_at')
        .order('occurred_at',{ascending:false})
        .range(from,from + 99);
      if (user) query = query.ilike('email','%' + user.replace(/[\\%_]/g,'\\$&') + '%');
      const {data,error} = await query;
      if (error) return reply(502,'로그인 이력을 불러오지 못했습니다. DB 마이그레이션 상태를 확인하세요.');
      return res.status(200).json({events:data || [],page,hasMore:(data || []).length === 100});
    } catch {
      return reply(502,'사용자 활동 기록 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.');
    }
  };
}
