/**
 * Formatting utilities for game display values.
 */

/**
 * Format crumb values with smart decimal display.
 * Shows 3 decimals for <1, 2 decimals for <100, 1 decimal for <10000,
 * integers with comma separators for larger values.
 * @param {number} value - Crumb amount
 * @returns {string} Formatted string
 */
export function formatCrumbs(value) {
  if (value == null || isNaN(value)) return '0';

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs < 0.0001) {
    // Very tiny values — show scientific-ish or fixed
    if (abs === 0) return '0';
    return sign + abs.toFixed(9).replace(/0+$/, '').replace(/\.$/, '.0');
  }
  if (abs < 1) {
    return sign + abs.toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0');
  }
  if (abs < 100) {
    return sign + abs.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }
  if (abs < 10000) {
    const formatted = abs.toFixed(1).replace(/\.0$/, '');
    return sign + addCommas(formatted);
  }
  return sign + addCommas(Math.floor(abs).toString());
}

/**
 * Add comma separators to a number string.
 * @param {string} numStr
 * @returns {string}
 */
function addCommas(numStr) {
  const parts = numStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}
