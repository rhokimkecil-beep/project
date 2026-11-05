export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { sourceId, cookie, apiKey, userId, name, description } = req.body || {};
  if (!sourceId || !apiKey || !userId) return res.status(400).json({ error: 'Parameter tidak lengkap' });

  try {
    // TAHAP 1: DOWNLOAD PAKE OPEN CLOUD API (Wajib punya scope legacy-asset:manage)
    const cloudRes = await fetch(`https://apis.roblox.com/asset-delivery-api/v1/assetId/${sourceId}`, {
      headers: { 'x-api-key': apiKey }
    });

    if (!cloudRes.ok) {
      const errText = await cloudRes.text();
      return res.status(cloudRes.status).json({ 
        success: false, 
        error: `[DOWNLOAD GAGAL] Status ${cloudRes.status}. API Key lo nggak punya akses ke aset ini. Pastikan API Key dibuat di akun yang sama dengan User ID, dan punya izin legacy-asset:manage.` 
      });
    }

    const metaData = await cloudRes.json();
    const locationUrl = metaData.location;

    if (!locationUrl) {
       return res.status(400).json({ success: false, error: `[DOWNLOAD GAGAL] Link download tidak ditemukan di response Roblox.` });
    }

    const downloadRes = await fetch(locationUrl);
    if (!downloadRes.ok) return res.status(500).json({ success: false, error: `[DOWNLOAD GAGAL] Gagal narik file dari CDN.` });

    const arrayBuffer = await downloadRes.arrayBuffer();
    const contentType = downloadRes.headers.get('content-type') || 'audio/mpeg';
    
    // TAHAP 2: UPLOAD
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
      return res.status(createRes.status).json({ success: false, error: errorMsg, detail: createData });
    }

    const operationId = createData.operationId || createData.operation?.id || createData.path?.split('/').pop();
    res.status(200).json({ success: true, operationId });
    
  } catch (e) {
    res.status(500).json({ success: false, error: `[SERVER ERROR] ${e.message}` });
  }
}
