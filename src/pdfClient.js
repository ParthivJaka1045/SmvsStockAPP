const PDF_SERVICE_BASE_URL = 'https://pdf-api-qlc3.onrender.com/api/pdfs';

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

export const generateSummaryReportPDFBlob = (report) => postPdf('/monthly-report', report);
