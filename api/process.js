export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  // Tambahkan assetType di sini
  const { sourceId, cookie, apiKey, userId, assetType, name, description } = req.body || {};
  if (!sourceId || !apiKey || !userId) return res.status(400).json({ error: 'Parameter tidak lengkap' });

  try {
    // TAHAP 1: DOWNLOAD
    const cloudRes = await fetch(`https://apis.roblox.com/asset-delivery-api/v1/assetId/${sourceId}`, {
      headers: { 'x-api-key': apiKey }
    });

    if (!cloudRes.ok) {
      const errText = await cloudRes.text();
      return res.status(cloudRes.status).json({ 
        success: false, 
        error: `[DOWNLOAD GAGAL] Status ${cloudRes.status}. API Key lo nggak punya akses ke aset ini.` 
      });
    }

    const metaData = await cloudRes.json();
    const locationUrl = metaData.location;

    if (!locationUrl) {
       return res.status(400).json({ success: false, error: `[DOWNLOAD GAGAL] Link download tidak ditemukan.` });
    }

    const downloadRes = await fetch(locationUrl);
    if (!downloadRes.ok) return res.status(500).json({ success: false, error: `[DOWNLOAD GAGAL] Gagal narik file dari CDN.` });

    const arrayBuffer = await downloadRes.arrayBuffer();
    const contentType = downloadRes.headers.get('content-type') || 'application/octet-stream';
    
    // TAHAP 2: UPLOAD
    const fileBlob = new Blob([arrayBuffer], { type: contentType });
    
    // Gunakan assetType dari frontend (Audio atau Animation)
    const metadata = {
      assetType: assetType || 'Audio', // <--- INI BAGIAN PENTINGNYA
      displayName: name || 'Spoofed Asset',
      description: description || '',
      creationContext: { creator: { userId: userId.toString() } }
    };

    const formData = new FormData();
    formData.append('request', JSON.stringify(metadata));
    // Kasih nama file yang sesuai formatnya
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
      if (createRes.status === 400) errorMsg += "Pastikan tipe aset sesuai dan User ID benar.";
      return res.status(createRes.status).json({ success: false, error: errorMsg, detail: createData });
    }

    const operationId = createData.operationId || createData.operation?.id || createData.path?.split('/').pop();
    res.status(200).json({ success: true, operationId });
    
  } catch (e) {
    res.status(500).json({ success: false, error: `[SERVER ERROR] ${e.message}` });
  }
}
