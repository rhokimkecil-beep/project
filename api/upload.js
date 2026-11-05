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

  const { apiKey, userId, name, description, fileBase64, contentType } = req.body || {};

  if (!apiKey) return res.status(400).json({ error: 'apiKey kosong' });
  if (!userId) return res.status(400).json({ error: 'userId kosong' });
  if (!fileBase64) return res.status(400).json({ error: 'fileBase64 kosong' });

  try {
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const fileBlob = new Blob([fileBuffer], { type: contentType || 'audio/mpeg' });

    const metadata = {
      assetType: 'Audio',
      displayName: name || 'Re-uploaded Audio',
      description: description || '',
      creationContext: {
        creator: { userId: userId.toString() }
      }
    };

    const formData = new FormData();
    formData.append('request', JSON.stringify(metadata));
    formData.append('fileContent', fileBlob, 'audio.mp3');

    const createRes = await fetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey
      },
      body: formData
    });

    const rawText = await createRes.text();
    let createData;
    
    try {
      createData = JSON.parse(rawText);
    } catch (err) {
      return res.status(createRes.status).json({
        error: 'Roblox membalas dengan format yang tidak valid.',
        status: createRes.status,
        detail: rawText || '(Response kosong)'
      });
    }

    if (!createRes.ok) {
      return res.status(createRes.status).json({
        error: 'roblox rejected',
        detail: createData
      });
    }

    const operationId = createData.operationId || createData.operation?.id || createData.path?.split('/').pop();

    if (!operationId) {
      return res.status(500).json({ error: 'operationId tidak ada', raw: createData });
    }

    res.status(200).json({ operationId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
