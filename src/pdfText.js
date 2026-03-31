const GUJARATI_SCRIPT_REGEX = /[\u0A80-\u0AFF]/;
const LATIN_SCRIPT_REGEX = /[A-Za-z]/;

// The embedded Gujarati font has no Latin glyphs, so prefer Helvetica whenever
// Latin letters are present and use the Gujarati font for Gujarati-only values.
export const getPdfTextFont = (value, gujaratiFont, latinFont = 'helvetica') => {
  const text = (value ?? '').toString();
  if (LATIN_SCRIPT_REGEX.test(text)) return latinFont;
  if (GUJARATI_SCRIPT_REGEX.test(text)) return gujaratiFont;
  return latinFont;
};
