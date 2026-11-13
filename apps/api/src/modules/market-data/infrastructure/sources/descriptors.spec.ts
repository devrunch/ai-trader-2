import { describe, it } from 'vitest';
import { expectConformingDescriptors } from '../../../../shared/sources/descriptor-conformance.spec-helper';
import { MARKET_DATA_DESCRIPTORS } from './descriptors';

describe('market-data source descriptors', () => {
  it('declare id, owner, limits, schedule, terms and docs', () => {
    expectConformingDescriptors(MARKET_DATA_DESCRIPTORS, 'market-data');
  });
});
