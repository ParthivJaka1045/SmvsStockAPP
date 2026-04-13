export async function saveBlob(blob, filename) {
  if (!(blob instanceof Blob)) {
    throw new Error('Invalid file data');
  }

  const safeName = (filename || 'download').replace(/[\\/:*?"<>|]+/g, '-');

  // Best path: bypass browser download manager (and IDM integration).
  // Works on https origins and localhost in modern Chromium-based browsers.
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: safeName,
      types: [
        {
          description: 'PDF',
          accept: { 'application/pdf': ['.pdf'] },
        },
      ],
    });

    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  // Fallback: regular download (might be intercepted by IDM).
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = safeName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Must be called directly from a user gesture (click/tap).
 * Opens the Save dialog first, then resolves the blob and writes it.
 */
export async function saveBlobFromProducer(produceBlob, filename) {
  if (typeof produceBlob !== 'function') {
    throw new Error('Invalid download handler');
  }

  const safeName = (filename || 'download').replace(/[\\/:*?"<>|]+/g, '-');

  // Gesture-safe path: open picker BEFORE any long async work.
  if (window.showSaveFilePicker) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: safeName,
        types: [
          {
            description: 'PDF',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
    } catch (error) {
      // User canceled the dialog.
      if (error && (error.name === 'AbortError' || error.name === 'NotAllowedError')) return;
      throw error;
    }

    const blob = await produceBlob();
    if (!(blob instanceof Blob)) {
      throw new Error('Invalid file data');
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  // No picker support: fall back to normal download flow.
  const blob = await produceBlob();
  await saveBlob(blob, safeName);
}

