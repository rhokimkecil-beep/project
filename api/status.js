export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { apiKey, operationId } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: 'apiKey kosong' });
  if (!operationId) return res.status(400).json({ error: 'operationId kosong' });

  try {
    const r = await fetch('https://apis.roblox.com/assets/v1/operations/' + operationId, {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: 'roblox rejected status', detail: data });
    }

    res.status(200).json({
      done: data.done === true,
      assetId: data.response?.assetId || data.response?.path?.split('/').pop() || null,
      error: data.error || null,
      raw: data
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
