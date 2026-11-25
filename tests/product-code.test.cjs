'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProductName, buildProductCode, buildSpecification, parseProductName } = require('../product-code.js');

test('품번은 5번째 자리 하이픈을 포함한 11자리로 조립된다', () => {
  const code = buildProductCode({ namePrefix: 'TS', namePart: 'HL', productType: 'OO', size: 'FS', color: '13' });
  assert.equal(code, 'TSHL-OOFS13');
  assert.equal(code.length, 11);
});

test('지정하지 않은 자리는 O로 채워진다', () => {
  assert.equal(buildProductCode({}), 'OOOO-OOOOOO');
  assert.equal(buildProductCode({ productType: 'ZU' }), 'OOOO-ZUOOOO');
});

test('규격은 IS- 접두사를 붙인 품번이다', () => {
  assert.equal(buildSpecification('TSHL-OOFS13'), 'IS-TSHL-OOFS13');
  assert.equal(buildSpecification(''), '');
});

test('품명은 1·2자리와 3·4자리를 언더스코어로 연결하고 다시 분리할 수 있다', () => {
  assert.equal(buildProductName('TS', 'HL'), 'TS_HL');
  assert.deepEqual(parseProductName('TS_HL'), { namePrefix: 'TS', namePart: 'HL' });
  assert.equal(parseProductName('TSHL'), null);
});

test('두 글자가 아니거나 영문·숫자가 아닌 자리는 거부한다', () => {
  assert.throws(() => buildProductCode({ color: '1' }), /PRODUCT_CODE_SEGMENT_INVALID/);
  assert.throws(() => buildProductCode({ size: 'F-' }), /PRODUCT_CODE_SEGMENT_INVALID/);
});
