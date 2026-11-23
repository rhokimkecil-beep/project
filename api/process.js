// Ganti seluruh isi while loop di dalam for loop audioList
// Lokasi: di dalam el.btnProcess event listener

while (retries > 0 && !success) {
  try {
    write(`  ⚡ Memproses ${assetType} di server...`, 'info');

    const processRes = await fetch('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId,
        cookie,
        apiKey,
        userId: creatorType !== 'group' ? userId : undefined,
        groupId: creatorType === 'group' ? groupId : undefined,
        creatorType,
        assetType,
        name: uploadName,
        description: 'Batch processed via Tool'
      })
    });

    const processData = await processRes.json();

    if (!processData.success) {
      // Deteksi alasan gagal dari skipReason
      if (processData.skipReason === 'private') {
        write(`  🔒 SKIP: Aset privat — tidak bisa diakses.`, 'warn');
        failCount++;
        break;
      }
      if (processData.skipReason === 'deleted') {
        write(`  🗑️ SKIP: Aset dihapus dari Roblox.`, 'warn');
        failCount++;
        break;
      }
      if (processData.error && processData.error.includes('429')) {
        throw new Error('RATE_LIMIT');
      }
      throw new Error(processData.error || 'Gagal memproses');
    }

    write('  ⏳ Menunggu Roblox Approve...', 'info');
    let assetId = null;
    for (let j = 0; j < 15; j++) {
      await new Promise(r => setTimeout(r, 2500));
      const pollRes = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, operationId: processData.operationId })
      });
      const pollData = await pollRes.json();
      if (pollData.done && pollData.assetId) { assetId = pollData.assetId; break; }
      if (pollData.error) throw new Error(JSON.stringify(pollData.error));
    }

    if (assetId) {
      write(`  ✅ SUKSES: rbxassetid://${assetId}`, 'success');
      successfulData.push({ name: audioName, id: assetId });
      successCount++;
      success = true;
    } else {
      throw new Error('Timeout menunggu Roblox');
    }

  } catch (err) {
    if (err.message === 'RATE_LIMIT') {
      retries--;
      if (retries > 0) {
        write(`  ⚠️ Kena limit (429). Nunggu 8 detik... (Sisa retry: ${retries})`, 'warn');
        await new Promise(r => setTimeout(r, 8000));
      } else {
        write(`  ❌ GAGAL: Batas limit Roblox tercapai.`, 'error');
        failCount++;
        break;
      }
    } else {
      write(`  ❌ GAGAL: ${err.message}`, 'error');
      failCount++;
      break;
    }
  }
}
