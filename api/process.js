export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { sourceId, cookie, apiKey, userId, name, description } = req.body || {};
  if (!sourceId || !cookie || !apiKey || !userId) return res.status(400).json({ error: 'Parameter tidak lengkap' });

  try {
    // ==========================================
    // TAHAP 1: DOWNLOAD AUDIO PAKAI COOKIE
    // ==========================================
    const v2Res = await fetch(`https://assetdelivery.roblox.com/v2/assetId/${sourceId}`, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!v2Res.ok) {
      return res.status(v2Res.status).json({ 
        success: false, 
        error: `[DOWNLOAD GAGAL] Status ${v2Res.status}. Cookie expired atau aset diprivatkan.` 
      });
    }

    const v2Data = await v2Res.json();
    
    // FIX: Nangkep format array dari Roblox yang baru
    let locationUrl = null;
    if (Array.isArray(v2Data) && v2Data.length > 0) {
      locationUrl = v2Data[0].location;
    } else if (v2Data && v2Data.location) {
      locationUrl = v2Data.location;
    }

    if (!locationUrl) {
       return res.status(400).json({ success: false, error: `[DOWNLOAD GAGAL] Link download tidak ditemukan. Response: ${JSON.stringify(v2Data)}` });
    }

    const downloadRes = await fetch(locationUrl);
    if (!downloadRes.ok) {
      return res.status(500).json({ success: false, error: `[DOWNLOAD GAGAL] Gagal narik file dari server CDN Roblox.` });
    }

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
      if (createRes.status === 400) errorMsg += "User ID harus sesuai pemilik API Key.";
      if (createRes.status === 403) errorMsg += "API Key tidak valid.";
      return res.status(createRes.status).json({ success: false, error: errorMsg, detail: createData });
    }

    const operationId = createData.operationId || createData.operation?.id || createData.path?.split('/').pop();
    if (!operationId) return res.status(500).json({ success: false, error: 'Operation ID tidak ditemukan.' });

    res.status(200).json({ success: true, operationId });
    
  } catch (e) {
    res.status(500).json({ success: false, error: `[SERVER ERROR] ${e.message}` });
  }
}
