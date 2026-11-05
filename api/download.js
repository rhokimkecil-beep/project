export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { sourceId, cookie } = req.body || {};
  if (!sourceId) return res.status(400).json({ error: 'sourceId kosong' });
  if (!cookie) return res.status(400).json({ error: 'cookie kosong' });

  try {
    const metaRes = await fetch(`https://assetdelivery.roblox.com/v1/asset?id=${sourceId}`, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      return res.status(metaRes.status).json({
        success: false,
        error: `Gagal ambil data (Status ${metaRes.status})`,
        detail: errText
      });
    }

    const arrayBuffer = await metaRes.arrayBuffer();
    const contentType = metaRes.headers.get('content-type') || 'audio/mpeg';
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    res.status(200).json({
      success: true,
      size: arrayBuffer.byteLength,
      contentType: contentType,
      base64: base64
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
