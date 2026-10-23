const ALLOWED_STAGES = new Set(['认知', '兴趣', '购买', '忠诚']);
const GENERIC_ERROR = '生成失败，请稍后再试。';
const TIMEOUT_ERROR = '请再试一次';

function send(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function characterCount(value) {
  return Array.from(value).length;
}

function validateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '请填写完整信息。';
  const { product_name: productName, selling_point: sellingPoint, stage } = body;
  if (typeof productName !== 'string' || !productName.trim()) return '请填写商品名。';
  if (characterCount(productName) > 30) return '商品名最多 30 字。';
  if (typeof sellingPoint !== 'string' || !sellingPoint.trim()) return '请填写核心卖点。';
  if (characterCount(sellingPoint) > 100) return '核心卖点最多 100 字。';
  if (!ALLOWED_STAGES.has(stage)) return '营销段请选择认知、兴趣、购买或忠诚。';
  return null;
}

function getMessage(error) {
  if (error && error.name === 'TimeoutError') return TIMEOUT_ERROR;
  if (error && error.name === 'AbortError') return TIMEOUT_ERROR;
  return GENERIC_ERROR;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { message: '请使用 POST 请求。' });
  }

  const accessCode = process.env.ACCESS_CODE;
  if (accessCode && req.body?.access_code !== accessCode) {
    return send(res, 401, { message: '口令不对' });
  }

  const invalid = validateInput(req.body);
  if (invalid) return send(res, 400, { message: invalid });

  const apiBase = process.env.DIFY_API_BASE;
  const apiKey = process.env.DIFY_API_KEY;
  if (!apiBase || !apiKey) return send(res, 500, { message: '服务尚未配置，请联系管理员。' });

  const endpoint = `${apiBase.replace(/\/+$/, '')}/workflows/run`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 59_000);

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {
          product_name: req.body.product_name,
          selling_point: req.body.selling_point,
          stage: req.body.stage
        },
        response_mode: 'blocking',
        user: 'xiaozhou-web'
      }),
      signal: controller.signal
    });

    if (!upstream.ok) return send(res, 502, { message: GENERIC_ERROR });
    const payload = await upstream.json();
    const outputs = payload && payload.data && payload.data.outputs;
    if (outputs && typeof outputs.title === 'string' && outputs.title.trim()) {
      return send(res, 200, { status: 'safe', title: outputs.title });
    }
    if (outputs && typeof outputs.verdict === 'string' && typeof outputs.draft === 'string') {
      return send(res, 200, { status: 'review', verdict: outputs.verdict, draft: outputs.draft });
    }
    return send(res, 502, { message: GENERIC_ERROR });
  } catch (error) {
    return send(res, 502, { message: getMessage(error) });
  } finally {
    clearTimeout(timeout);
  }
};
