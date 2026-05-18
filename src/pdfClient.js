const PDF_SERVICE_BASE_URL = (
  typeof import.meta.env.VITE_PDF_SERVICE_BASE_URL === 'string' && import.meta.env.VITE_PDF_SERVICE_BASE_URL.trim()
    ? import.meta.env.VITE_PDF_SERVICE_BASE_URL.trim()
    : 'https://smvs-stock-api.onrender.com/api/pdfs'
).replace(/\/+$/, '');
const extractErrorMessage = async (response) => {
  const fallback = `PDF service error (${response.status})`;
  const contentType = response.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      return payload.message || payload.error || fallback;
    }

    const text = await response.text();
    return text || fallback;
  } catch {
    return fallback;
  }
};

const postPdf = async (path, payload) => {
  let response;

  try {
    response = await fetch(`${PDF_SERVICE_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(`PDF service unreachable. ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  return response.blob();
};

export const generateRequestPDFBlob = (order) => postPdf('/request', order);

export const generateDispatchPDFBlob = (order) => postPdf('/dispatch', order);

export const generatePurchasePDFBlob = (purchase) => postPdf('/purchase', purchase);

/**
 * Monthly/yearly stock report PDF — Java pdf-service (`POST .../monthly-report`), portrait A4.
 * Optional `VITE_PDF_SERVICE_BASE_URL` overrides the default API root.
 */
export const generateSummaryReportPDFBlob = (report) => postPdf('/monthly-report', report);
