export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { sourceId, cookie, apiKey, userId, assetType, name, description } = req.body || {};
  if (!sourceId || !apiKey || !userId) return res.status(400).json({ error: 'Parameter tidak lengkap' });

  try {
    let downloadRes = null;
    let errorDetail = '';

    // METODE 1: Endpoint Klasik Web (Sering Bypass Blokir)
    if (cookie) {
      try {
        const webRes = await fetch(`https://www.roblox.com/asset/?id=${sourceId}`, {
          headers: {
            'Cookie': `.ROBLOSECURITY=${cookie}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*'
          }
        });
        if (webRes.ok) {
          downloadRes = webRes;
        } else {
           errorDetail += `| Web API Status: ${webRes.status} `;
        }
      } catch (e) { errorDetail += `| Web API Err: ${e.message} `; }
    }

    // METODE 2: assetdelivery V1 (Format ?id=)
    if (!downloadRes || !downloadRes.ok) {
      if (cookie) {
        try {
          const v1Res = await fetch(`https://assetdelivery.roblox.com/v1/asset/?id=${sourceId}`, {
            headers: {
              'Cookie': `.ROBLOSECURITY=${cookie}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'Accept': 'application/json'
            }
          });
          if (v1Res.ok) {
            const v1Data = await v1Res.json();
            let loc = null;
            if (Array.isArray(v1Data) && v1Data.length > 0) loc = v1Data[0].location;
            else if (v1Data && v1Data.location) loc = v1Data.location;

            if (loc) {
              downloadRes = await fetch(loc);
            } else {
              errorDetail += `| V1 API: No Location `;
            }
          } else {
             errorDetail += `| V1 API Status: ${v1Res.status} `;
          }
        } catch (e) { errorDetail += `| V1 API Err: ${e.message} `; }
      }
    }

    // METODE 3: Open Cloud API (Pake API Key)
    if (!downloadRes || !downloadRes.ok) {
      try {
        const cloudRes = await fetch(`https://apis.roblox.com/asset-delivery-api/v1/assetId/${sourceId}`, {
          headers: { 'x-api-key': apiKey }
        });
        if (cloudRes.ok) {
          const metaData = await cloudRes.json();
          let loc = null;
          if (Array.isArray(metaData) && metaData.length > 0) loc = metaData[0].location;
          else if (metaData && metaData.location) loc = metaData.location;

          if (loc) {
            downloadRes = await fetch(loc);
          } else {
             errorDetail += `| Cloud API: No Location `;
          }
        } else {
          const errText = await cloudRes.text();
          errorDetail += `| Cloud API Status: ${cloudRes.status} (${errText}) `;
        }
      } catch (e) { errorDetail += `| Cloud API Err: ${e.message} `; }
    }

    if (!downloadRes || !downloadRes.ok) {
       return res.status(400).json({ success: false, error: `[DOWNLOAD GAGAL] ${errorDetail}` });
    }

    // TAHAP 2: UPLOAD
    const arrayBuffer = await downloadRes.arrayBuffer();
    const contentType = downloadRes.headers.get('content-type') || 'application/octet-stream';
    
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
