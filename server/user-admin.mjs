const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailValid = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const passwordValid = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
const banned = user => user.banned_until && new Date(user.banned_until).getTime() > Date.now();

export function createAdminHandler({createClient,env = process.env}) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const reply = (status,message) => res.status(status).json({error:message});
    if (!['GET','POST','PATCH'].includes(req.method)) {
      res.setHeader('Allow','GET, POST, PATCH'); return reply(405,'지원하지 않는 요청입니다.');
    }
    const url = env.SUPABASE_URL;
    const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    const admins = new Set((env.ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(id => UUID.test(id)));
    const missing = [!url && 'SUPABASE_URL',!secret && 'SUPABASE_SECRET_KEY',!admins.size && 'ADMIN_USER_IDS (유효한 사용자 UUID)'].filter(Boolean);
    if (missing.length) return reply(503,'Vercel 환경변수 설정이 필요합니다: ' + missing.join(', ') + '. Production 환경에 저장하고 Redeploy해 주세요.');
    const match = /^Bearer ([^\s]{1,8192})$/.exec(req.headers.authorization || '');
    if (!match) return reply(401,'로그인이 필요합니다.');
    try {
      const client = createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
      // 클라이언트의 UUID나 metadata를 믿지 않고 서버에서 액세스 토큰을 검증합니다.
      const {data:auth,error:authError} = await client.auth.getUser(match[1]);
      if (authError || !auth?.user) return reply(401,'로그인 세션이 만료되었습니다.');
      const permissionsOnly = req.method === 'GET' && req.query?.action === 'permissions';
      if (!admins.has(auth.user.id)) {
        if (permissionsOnly) return res.status(200).json({is_admin:false});
        return reply(403,'관리자만 사용할 수 있습니다.');
      }
      const {data:actor,error:actorError} = await client.auth.admin.getUserById(auth.user.id);
      if (actorError || !actor?.user || banned(actor.user)) return reply(403,'사용할 수 없는 관리자 계정입니다.');
      if (permissionsOnly) return res.status(200).json({is_admin:true});
      const publicUser = user => ({id:user.id,email:user.email || '',created_at:user.created_at,last_sign_in_at:user.last_sign_in_at || null,disabled:!!banned(user) || (!admins.has(user.id) && user.app_metadata?.inventory_access !== true),is_admin:admins.has(user.id)});
      if (req.method === 'GET') {
        const page = Number(req.query?.page || 1);
        if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return reply(400,'페이지 번호가 올바르지 않습니다.');
        const {data,error} = await client.auth.admin.listUsers({page,perPage:50});
        if (error) return reply(502,'사용자 목록을 불러오지 못했습니다.');
        return res.status(200).json({users:data.users.map(publicUser),page,hasMore:data.users.length === 50});
      }
      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
      catch { return reply(400,'잘못된 요청입니다.'); }
      if (!body || Array.isArray(body) || typeof body !== 'object' || JSON.stringify(body).length > 16384) return reply(400,'잘못된 요청입니다.');
      const allowed = req.method === 'POST' ? ['email','password'] : ['id','email','password','disabled'];
      if (Object.keys(body).some(key => !allowed.includes(key))) return reply(400,'허용되지 않는 입력 항목입니다.');
      if (req.method === 'POST') {
        if (!emailValid(body.email) || !passwordValid(body.password)) return reply(400,'이메일과 12~128자 비밀번호를 입력하세요.');
        const {data,error} = await client.auth.admin.createUser({email:body.email.trim(),password:body.password,email_confirm:true,app_metadata:{inventory_access:true}});
        if (error) return reply(400,'계정을 생성하지 못했습니다. 중복 이메일과 비밀번호 조건을 확인하세요.');
        return res.status(201).json({user:publicUser(data.user)});
      }
      if (typeof body.id !== 'string' || !UUID.test(body.id)) return reply(400,'사용자 ID가 올바르지 않습니다.');
      const changes = {};
      if ('email' in body) {
        if (!emailValid(body.email)) return reply(400,'이메일 형식을 확인하세요.');
        changes.email = body.email.trim(); changes.email_confirm = true;
      }
      if ('password' in body) {
        if (!passwordValid(body.password)) return reply(400,'비밀번호는 12~128자로 입력하세요.');
        changes.password = body.password;
      }
      if ('disabled' in body) {
        if (typeof body.disabled !== 'boolean') return reply(400,'계정 상태가 올바르지 않습니다.');
        if (body.disabled && admins.has(body.id)) return reply(400,'관리자 계정은 비활성화할 수 없습니다.');
        changes.ban_duration = body.disabled ? '876000h' : 'none';
        if (!body.disabled) {
          const {data:target,error:targetError} = await client.auth.admin.getUserById(body.id);
          if (targetError || !target?.user) return reply(400,'사용자를 찾을 수 없습니다.');
          changes.app_metadata = {...target.user.app_metadata,inventory_access:true};
        }
      }
      if (!Object.keys(changes).length) return reply(400,'변경할 내용을 입력하세요.');
      const {data,error} = await client.auth.admin.updateUserById(body.id,changes);
      if (error) return reply(400,'사용자를 변경하지 못했습니다. 이메일과 비밀번호 조건을 확인하세요.');
      return res.status(200).json({user:publicUser(data.user)});
    } catch {
      return reply(502,'사용자 관리 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.');
    }
  };
}
