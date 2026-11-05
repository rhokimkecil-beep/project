export const config = {
  api: {
    bodyParser: { sizeLimit: '25mb' }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { sourceId, cookie, apiKey, userId, name, description } = req.body || {};

  if (!sourceId || !cookie || !apiKey || !userId) {
    return res.status(400).json({ error: 'Parameter tidak lengkap' });
  }

  try {
    // --- LANGKAH 1: DOWNLOAD DARI ROBLOX ---
    const metaRes = await fetch(`https://assetdelivery.roblox.com/v1/asset?id=${sourceId}`, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!metaRes.ok) {
      // Kalau kena limit (403) atau error lain
      return res.status(metaRes.status).json({ 
        success: false, 
        error: `Download gagal (Status ${metaRes.status})` 
      });
    }

    const arrayBuffer = await metaRes.arrayBuffer();
    const contentType = metaRes.headers.get('content-type') || 'audio/mpeg';

    // --- LANGKAH 2: UPLOAD KE ROBLOX ---
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
    
    if (!operationId) {
      return res.status(500).json({ success: false, error: 'Operation ID tidak ditemukan' });
    }

    // Kembalikan operationId ke frontend buat di-polling
    res.status(200).json({ success: true, operationId });
    
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
