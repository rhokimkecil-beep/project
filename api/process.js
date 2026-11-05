export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { sourceId, cookie, apiKey, userId, name, description } = req.body || {};
  if (!sourceId || !cookie || !apiKey || !userId) return res.status(400).json({ error: 'Parameter tidak lengkap' });

  try {
    // ==========================================
    // TAHAP 1: DOWNLOAD AUDIO (Auto-Bypass)
    // ==========================================
    let downloadRes;
    
    // Metode A: Trik Endpoint Lama (Pura-pura jadi Browser Chrome)
    downloadRes = await fetch(`https://assetdelivery.roblox.com/v1/asset?id=${sourceId}`, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.roblox.com/',
        'Origin': 'https://www.roblox.com',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    // Metode B: Kalau Metode A gagal (403/401), Pindah ke Open Cloud API
    if (!downloadRes.ok) {
      const cloudRes = await fetch(`https://apis.roblox.com/asset-delivery-api/v1/assetId/${sourceId}`, {
        headers: { 'x-api-key': apiKey }
      });

      if (cloudRes.ok) {
        const metaData = await cloudRes.json();
        if (metaData.location) {
          // Ambil file asli dari CDN
          downloadRes = await fetch(metaData.location);
        } else {
           return res.status(400).json({ success: false, error: `[DOWNLOAD GAGAL] API Key tidak punya akses ke aset ini.` });
        }
      } else {
         return res.status(403).json({ success: false, error: `[DOWNLOAD GAGAL] Cookie mati atau aset di-private total.` });
      }
    }

    // Baca file audionya
    const arrayBuffer = await downloadRes.arrayBuffer();
    const contentType = downloadRes.headers.get('content-type') || 'audio/mpeg';
    
    // ==========================================
    // TAHAP 2: UPLOAD KE AKUN LO
    // ==========================================
    const fileBlob = new Blob([arrayBuffer], { type: contentType });
    const metadata = {
      assetType: 'Audio',
      displayName: name || 'Spoofed Audio',
      description: description || '',
      creationContext: { creator: { userId: userId.toString() } }
    };

    const formData = new FormData();
    formData.append('request', JSON.stringify(metadata));
    formData.append('fileContent', fileBlob, 'audio.mp3');

    const createRes = await fetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: formData
    });

    const rawText = await createRes.text();
    let createData;
    try { createData = JSON.parse(rawText); } catch (e) { createData = { raw: rawText }; }

    if (!createRes.ok) {
      let errorMsg = `[UPLOAD GAGAL] Status ${createRes.status}. `;
      if (createRes.status === 400) errorMsg += "Pastikan User ID website SAMA DENGAN pemilik API Key.";
      if (createRes.status === 403) errorMsg += "API Key tidak valid/expired.";
      return res.status(createRes.status).json({ success: false, error: errorMsg, detail: createData });
    }

    const operationId = createData.operationId || createData.operation?.id || createData.path?.split('/').pop();
    if (!operationId) return res.status(500).json({ success: false, error: 'Operation ID tidak ditemukan.' });

    res.status(200).json({ success: true, operationId });
    
  } catch (e) {
    res.status(500).json({ success: false, error: `[SERVER ERROR] ${e.message}` });
  }
}
