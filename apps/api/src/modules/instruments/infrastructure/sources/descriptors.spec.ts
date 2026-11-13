import { describe, it } from 'vitest';
import { expectConformingDescriptors } from '../../../../shared/sources/descriptor-conformance.spec-helper';
import { NASDAQ_TRADER_DESCRIPTOR } from './descriptors';

describe('instruments source descriptors', () => {
  it('declare id, owner, limits, schedule, terms and docs', () => {
    expectConformingDescriptors([NASDAQ_TRADER_DESCRIPTOR], 'instruments');
  });
});
