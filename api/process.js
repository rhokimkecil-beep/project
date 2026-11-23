// --- api/process.js ---
// Tambah helper di atas handler
async function safeFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout per request
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return r;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    sourceId, cookie, apiKey,
    userId, groupId, creatorType,
    assetType, name, description
  } = req.body || {};

  if (!sourceId || !apiKey) return res.status(400).json({ error: 'Parameter tidak lengkap' });
  if (creatorType === 'group' && !groupId) return res.status(400).json({ error: 'Group ID kosong' });
  if (creatorType !== 'group' && !userId) return res.status(400).json({ error: 'User ID kosong' });

  const creationContext = creatorType === 'group'
    ? { creator: { groupId: groupId.toString() } }
    : { creator: { userId: userId.toString() } };

  try {
    let downloadRes = null;
    let errorDetail = '';
    let skipReason = null;

    // METODE 1: Endpoint Klasik
    if (cookie) {
      try {
        const webRes = await safeFetch(`https://www.roblox.com/asset/?id=${sourceId}`, {
          headers: {
            'Cookie': `.ROBLOSECURITY=${cookie}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*'
          }
        });
        if (webRes.ok) {
          downloadRes = webRes;
        } else {
          if (webRes.status === 403) skipReason = 'private';
          if (webRes.status === 404) skipReason = 'deleted';
          errorDetail += `| Web API: ${webRes.status} `;
        }
      } catch (e) { errorDetail += `| Web API Err: ${e.message} `; }
    }

    // METODE 2: V1 Asset Delivery
    if (!downloadRes) {
      if (cookie) {
        try {
          const v1Res = await safeFetch(`https://assetdelivery.roblox.com/v1/asset/?id=${sourceId}`, {
            headers: {
              'Cookie': `.ROBLOSECURITY=${cookie}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'Accept': 'application/json'
            }
          });
          if (v1Res.ok) {
            const ct = v1Res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const v1Data = await v1Res.json();
              let loc = null;
              if (Array.isArray(v1Data) && v1Data.length > 0) loc = v1Data[0].location;
              else if (v1Data && v1Data.location) loc = v1Data.location;
              if (loc) downloadRes = await safeFetch(loc);
              else errorDetail += `| V1: No Loc `;
            } else {
              // Response bukan JSON — langsung treat sebagai binary download
              downloadRes = v1Res;
            }
          } else {
            if (v1Res.status === 403 && !skipReason) skipReason = 'private';
            if (v1Res.status === 404 && !skipReason) skipReason = 'deleted';
            errorDetail += `| V1 Status: ${v1Res.status} `;
          }
        } catch (e) { errorDetail += `| V1 Err: ${e.message} `; }
      }
    }

    // METODE 3: Item Delivery API
    if (!downloadRes) {
      if (cookie) {
        try {
          const itemRes = await safeFetch(`https://itemdelivery.roblox.com/v1/asset/${sourceId}`, {
            headers: {
              'Cookie': `.ROBLOSECURITY=${cookie}`,
              'User-Agent': 'Roblox/WinInet'
            }
          });
          if (itemRes.ok) {
            const ct = itemRes.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const itemData = await itemRes.json();
              if (itemData.url) downloadRes = await safeFetch(itemData.url);
              else errorDetail += `| Item: No URL `;
            } else {
              downloadRes = itemRes;
            }
          } else {
            errorDetail += `| Item Status: ${itemRes.status} `;
          }
        } catch (e) { errorDetail += `| Item Err: ${e.message} `; }
      }
    }

    // METODE 4: Open Cloud API
    if (!downloadRes) {
      try {
        const cloudRes = await safeFetch(`https://apis.roblox.com/asset-delivery-api/v1/assetId/${sourceId}`, {
          headers: { 'x-api-key': apiKey }
        });
        if (cloudRes.ok) {
          const ct = cloudRes.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const metaData = await cloudRes.json();
            let loc = null;
            if (Array.isArray(metaData) && metaData.length > 0) loc = metaData[0].location;
            else if (metaData && metaData.location) loc = metaData.location;
            if (loc) downloadRes = await safeFetch(loc);
            else errorDetail += `| Cloud: No Loc `;
          } else {
            downloadRes = cloudRes;
          }
        } else {
          errorDetail += `| Cloud Status: ${cloudRes.status} `;
        }
      } catch (e) { errorDetail += `| Cloud Err: ${e.message} `; }
    }

    if (!downloadRes || !downloadRes.ok) {
      return res.status(400).json({
        success: false,
        skipReason: skipReason || 'unknown',
        error: `[DOWNLOAD GAGAL] ${errorDetail}`
      });
    }

    // UPLOAD
    const arrayBuffer = await downloadRes.arrayBuffer();
    const contentType = downloadRes.headers.get('content-type') || 'application/octet-stream';
    const fileBlob = new Blob([arrayBuffer], { type: contentType });

    const metadata = {
      assetType: assetType || 'Audio',
      displayName: name || 'Spoofed Asset',
      description: description || '',
      creationContext
    };

    const formData = new FormData();
    formData.append('request', JSON.stringify(metadata));
    const fileName = assetType === 'Animation' ? 'animation.rbxm' : 'audio.mp3';
    formData.append('fileContent', fileBlob, fileName);

    const createRes = await safeFetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: formData
    });

    const rawText = await createRes.text();
    let createData;
    try { createData = JSON.parse(rawText); } catch (e) { createData = { raw: rawText }; }

    if (!createRes.ok) {
      let errorMsg = `[UPLOAD GAGAL] Status ${createRes.status}. `;
      if (createRes.status === 400) {
        errorMsg += creatorType === 'group'
          ? 'API Key harus punya akses ke grup tersebut.'
          : 'User ID harus sesuai pemilik API Key.';
      }
      return res.status(createRes.status).json({ success: false, error: errorMsg, detail: createData });
    }

    const operationId = createData.operationId || createData.operation?.id || createData.path?.split('/').pop();
    res.status(200).json({ success: true, operationId });

  } catch (e) {
    res.status(500).json({ success: false, error: `[SERVER ERROR] ${e.message}` });
  }
}
