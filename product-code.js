'use strict';

const PLACEHOLDER_CHAR = 'O';
const SEGMENT_LENGTH = 2;
const SEGMENT_PATTERN = /^[A-Z0-9]{2}$/;

function normalizeSegment(value) {
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return PLACEHOLDER_CHAR.repeat(SEGMENT_LENGTH);
  if (!SEGMENT_PATTERN.test(text)) throw new Error('PRODUCT_CODE_SEGMENT_INVALID');
  return text;
}

function buildProductName(namePrefix, namePart) {
  return normalizeSegment(namePrefix) + '_' + normalizeSegment(namePart);
}

function buildProductCode({ namePrefix, namePart, productType, size, color }) {
  return normalizeSegment(namePrefix) + normalizeSegment(namePart)
    + '-' + normalizeSegment(productType) + normalizeSegment(size) + normalizeSegment(color);
}

function buildSpecification(productCode) {
  return productCode ? 'IS-' + productCode : '';
}

function parseProductName(productName) {
  const match = /^([A-Z0-9]{2})_([A-Z0-9]{2})$/.exec(String(productName ?? '').trim().toUpperCase());
  return match ? { namePrefix: match[1], namePart: match[2] } : null;
}

const api = { buildProductName, buildProductCode, buildSpecification, parseProductName };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.productCode = api;
