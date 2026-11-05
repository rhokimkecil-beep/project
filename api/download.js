export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { sourceId } = req.body || {};
  if (!sourceId) return res.status(400).json({ error: 'sourceId kosong' });

  try {
    const metaRes = await fetch('https://assetdelivery.roblox.com/v1/asset?id=' + sourceId, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!metaRes.ok) {
      return res.status(metaRes.status).json({
        success: false,
        error: 'assetdelivery gagal, status ' + metaRes.status,
        hint: 'Audio mungkin private total atau butuh cookie owner'
      });
    }

    const meta = await metaRes.json();
    const audioUrl = meta.location || meta.locationUrl;
    if (!audioUrl) {
      return res.status(500).json({
        success: false,
        error: 'location tidak ada di response',
        raw: meta
      });
    }

    const audioRes = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!audioRes.ok) {
      return res.status(audioRes.status).json({
        success: false,
        error: 'CDN fetch gagal, status ' + audioRes.status
      });
    }

    const contentType = audioRes.headers.get('content-type') || 'audio/mpeg';
    const arrayBuffer = await audioRes.arrayBuffer();
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