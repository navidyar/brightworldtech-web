function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPrice(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return escapeHtml(value);
  }

  return `$${number.toFixed(2)}`;
}

module.exports = {
  escapeHtml,
  formatPrice
};