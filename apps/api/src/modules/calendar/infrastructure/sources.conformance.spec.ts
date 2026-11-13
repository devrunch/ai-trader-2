import { describe, it } from 'vitest';
import { expectConformingDescriptors } from '../../../shared/sources/descriptor-conformance.spec-helper';
import { FF_WEEKLY_DESCRIPTOR } from './forex-factory.source';
import { EIA_DESCRIPTOR } from './eia.source';
import { MOSPI_DESCRIPTOR, RBI_DESCRIPTOR } from './india-schedule.source';
import { TWELVE_DATA_EARNINGS_DESCRIPTOR } from './twelve-data-earnings.source';

describe('calendar source descriptors', () => {
  it('declare id, owner, limits, schedule, terms and docs', () => {
    expectConformingDescriptors([FF_WEEKLY_DESCRIPTOR, RBI_DESCRIPTOR, MOSPI_DESCRIPTOR, EIA_DESCRIPTOR, TWELVE_DATA_EARNINGS_DESCRIPTOR], 'calendar');
  });
});
