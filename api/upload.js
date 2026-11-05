export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { apiKey, name, description, fileBase64, contentType } = req.body || {};

  if (!apiKey) return res.status(400).json({ error: 'apiKey kosong' });
  if (!fileBase64) return res.status(400).json({ error: 'fileBase64 kosong' });

  try {
    const payload = {
      assetType: 'Audio',
      displayName: name || 'Re-uploaded Audio',
      description: description || '',
      creationContext: {
        creator: { userId: '0' }
      }
    };

    const createRes = await fetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      return res.status(createRes.status).json({
        error: 'roblox rejected create',
        detail: createData
      });
    }

    const operationId = createData.operationId || createData.operation?.id || createData.path?.split('/').pop();
    const uploadUrl = createData.uploadUrl || createData.upload?.url || createData.response?.uploadUrl;

    if (!operationId) {
      return res.status(500).json({
        error: 'operationId tidak ada di response',
        raw: createData
      });
    }

    res.status(200).json({
      operationId: operationId,
      uploadUrl: uploadUrl,
      contentType: contentType || 'audio/mpeg',
      raw: createData
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}