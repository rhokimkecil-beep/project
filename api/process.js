export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { sourceId, cookie, apiKey, userId, assetType, name, description } = req.body || {};
  if (!sourceId || !apiKey || !userId) return res.status(400).json({ error: 'Parameter tidak lengkap' });

  try {
    let downloadRes;
    
    // METODE 1: Paksa pakai Cookie + Trik Header Browser (Biar lolos dari blokir Vercel)
    if (cookie) {
      downloadRes = await fetch(`https://assetdelivery.roblox.com/v1/asset?id=${sourceId}`, {
        headers: {
          'Cookie': `.ROBLOSECURITY=${cookie}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.roblox.com/',
          'Origin': 'https://www.roblox.com',
          'Accept': 'application/json, text/plain, */*'
        }
      });
    }

    // METODE 2: Kalau Cookie gagal, tembak pakai API Key (Open Cloud)
    if (!downloadRes || !downloadRes.ok) {
      const cloudRes = await fetch(`https://apis.roblox.com/asset-delivery-api/v1/assetId/${sourceId}`, {
        headers: { 'x-api-key': apiKey }
      });

      if (cloudRes.ok) {
        const metaData = await cloudRes.json();
        let locationUrl = null;
        if (Array.isArray(metaData) && metaData.length > 0) locationUrl = metaData[0].location;
        else if (metaData && metaData.location) locationUrl = metaData.location;

        if (locationUrl) {
          downloadRes = await fetch(locationUrl);
        } else {
          return res.status(400).json({ success: false, error: `[DOWNLOAD GAGAL] Link download tidak ditemukan.` });
        }
      } else {
        return res.status(403).json({ success: false, error: `[DOWNLOAD GAGAL] IP Vercel diblokir Roblox. Coba lagi nanti.` });
      }
    }

    if (!downloadRes || !downloadRes.ok) {
       return res.status(500).json({ success: false, error: `[DOWNLOAD GAGAL] Gagal narik file dari CDN.` });
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const contentType = downloadRes.headers.get('content-type') || 'application/octet-stream';
    
    // TAHAP 2: UPLOAD
    const fileBlob = new Blob([arrayBuffer], { type: contentType });
    
    const metadata = {
      assetType: assetType || 'Audio',
      displayName: name || 'Spoofed Asset',
      description: description || '',
      creationContext: { creator: { userId: userId.toString() } }
    };

    const formData = new FormData();
    formData.append('request', JSON.stringify(metadata));
    const fileName = assetType === 'Animation' ? 'animation.rbxm' : 'audio.mp3';
    formData.append('fileContent', fileBlob, fileName);

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
      return res.status(createRes.status).json({ success: false, error: errorMsg, detail: createData });
    }

    const operationId = createData.operationId || createData.operation?.id || createData.path?.split('/').pop();
    res.status(200).json({ success: true, operationId });
    
  } catch (e) {
    res.status(500).json({ success: false, error: `[SERVER ERROR] ${e.message}` });
  }
}
