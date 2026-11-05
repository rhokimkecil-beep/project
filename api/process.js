export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  
  const { sourceId, cookie, apiKey, userId, name, description } = req.body || {};
  if (!sourceId || !cookie || !apiKey || !userId) return res.status(400).json({ error: 'Parameter tidak lengkap' });

  try {
    // 1. DOWNLOAD menggunakan endpoint Open Cloud yang BARU (apis.roblox.com)
    const downloadRes = await fetch(`https://apis.roblox.com/asset-delivery-api/v1/assetId/${sourceId}`, {
      headers: {
        'x-api-key': apiKey, // Wajib pakai API Key dengan scope legacy-asset:manage
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!downloadRes.ok) {
      const errText = await downloadRes.text();
      return res.status(downloadRes.status).json({ 
        success: false, 
        error: `Download gagal (Status ${downloadRes.status})`, 
        detail: errText 
      });
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const contentType = downloadRes.headers.get('content-type') || 'audio/mpeg';
    
    // 2. UPLOAD ke Roblox (tetap pakai API Key)
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
    try { createData = JSON.parse(rawText); } catch (e) { createData = {}; }

    if (!createRes.ok) {
      return res.status(createRes.status).json({ success: false, error: 'Roblox reject upload', detail: createData });
    }

    const operationId = createData.operationId || createData.operation?.id || createData.path?.split('/').pop();
    if (!operationId) return res.status(500).json({ success: false, error: 'Operation ID tidak ditemukan' });

    res.status(200).json({ success: true, operationId });
    
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
