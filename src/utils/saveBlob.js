const sanitizeFilename = (filename) =>
  (filename || 'download').replace(/[\\/:*?"<>|]+/g, '-');

const isSavePickerAbort = (error) =>
  error && error.name === 'AbortError';

const isSavePickerGestureError = (error) => {
  if (!error) return false;
  if (error.name === 'SecurityError' || error.name === 'NotAllowedError') return true;
  const msg = (error.message || '').toString().toLowerCase();
  return msg.includes('user gesture') || msg.includes('gesture');
};

const triggerAnchorDownload = (blob, safeName) => {
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
};

const pickSaveFile = async (safeName) => {
  if (!window.showSaveFilePicker) return null;
  try {
    return await window.showSaveFilePicker({
      suggestedName: safeName,
      types: [
        {
          description: 'PDF',
          accept: { 'application/pdf': ['.pdf'] },
        },
      ],
    });
  } catch (error) {
    if (isSavePickerAbort(error)) return 'aborted';
    if (isSavePickerGestureError(error)) return null;
    throw error;
  }
};

const writeBlobToHandle = async (handle, blob) => {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
};

export async function saveBlob(blob, filename) {
  if (!(blob instanceof Blob)) {
    throw new Error('Invalid file data');
  }

  const safeName = sanitizeFilename(filename);
  const handle = await pickSaveFile(safeName);
  if (handle === 'aborted') return;
  if (handle) {
    await writeBlobToHandle(handle, blob);
    return;
  }

  triggerAnchorDownload(blob, safeName);
}

/**
 * Call from a user gesture. Opens Save dialog first (while gesture is active),
 * then builds the PDF blob and writes the file. Falls back to <a download> if needed.
 */
export async function saveBlobFromProducer(produceBlob, filename) {
  if (typeof produceBlob !== 'function') {
    throw new Error('Invalid download handler');
  }

  const safeName = sanitizeFilename(filename);

  const handle = await pickSaveFile(safeName);
  if (handle === 'aborted') return;

  const blob = await produceBlob();
  if (!(blob instanceof Blob)) {
    throw new Error('Invalid file data');
  }

  if (handle) {
    await writeBlobToHandle(handle, blob);
    return;
  }

  triggerAnchorDownload(blob, safeName);
}
