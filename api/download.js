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

    let arrayBuffer;
    let contentType = metaRes.headers.get('content-type') || 'audio/mpeg';

    // Cek apakah response berupa JSON (metadata lama) atau langsung file binary (sekarang)
    if (contentType.includes('application/json')) {
      const meta = await metaRes.json();
      const audioUrl = meta.location || meta.locationUrl;
      
      if (!audioUrl) {
        return res.status(500).json({ success: false, error: 'Location URL tidak ditemukan' });
      }

      const audioRes = await fetch(audioUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!audioRes.ok) {
        return res.status(audioRes.status).json({ success: false, error: `CDN fetch gagal (Status ${audioRes.status})` });
      }

      contentType = audioRes.headers.get('content-type') || contentType;
      arrayBuffer = await audioRes.arrayBuffer();
    } else {
      // Kalau langsung file (OggS, ID3, dll), ambil langsung datanya
      arrayBuffer = await metaRes.arrayBuffer();
    }

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
