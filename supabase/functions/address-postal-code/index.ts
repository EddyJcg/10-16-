// 배포: supabase functions deploy address-postal-code
// 비밀값: supabase secrets set KAKAO_REST_API_KEY=<카카오 REST API 키>
// 로그인 JWT 검증은 기본값(verify_jwt=true)으로 동작합니다.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const KAKAO_ADDRESS_URL = 'https://dapi.kakao.com/v2/local/search/address.json';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function findRoadZoneNo(query: string, key: string): Promise<string> {
  const res = await fetch(`${KAKAO_ADDRESS_URL}?size=1&query=${encodeURIComponent(query)}`, {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  if (!res.ok) throw new Error(`KAKAO_${res.status}`);
  const body = await res.json();
  const zoneNo = body?.documents?.[0]?.road_address?.zone_no;
  return zoneNo ? String(zoneNo) : '';
}

// 상세주소(동·호수)가 붙은 주소는 검색되지 않을 수 있어 뒤에서부터 단어를 줄여 다시 검색합니다.
async function findPostalCode(address: string, key: string): Promise<string> {
  const words = address.split(/\s+/).filter(Boolean);
  for (let count = words.length; count >= 2; count--) {
    const zoneNo = await findRoadZoneNo(words.slice(0, count).join(' '), key);
    if (zoneNo) return zoneNo;
  }
  return '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const key = Deno.env.get('KAKAO_REST_API_KEY');
  if (!key) return json({ error: 'KAKAO_KEY_NOT_CONFIGURED' }, 500);

  let query = '';
  try {
    const body = await req.json();
    query = String(body?.query ?? '').trim();
  } catch {
    return json({ error: 'INVALID_BODY' }, 400);
  }
  if (!query || query.length > 300) return json({ error: 'INVALID_QUERY' }, 400);

  try {
    return json({ postal_code: await findPostalCode(query, key) });
  } catch (error) {
    console.error('address-postal-code lookup failed', error);
    return json({ error: 'LOOKUP_FAILED' }, 502);
  }
});
