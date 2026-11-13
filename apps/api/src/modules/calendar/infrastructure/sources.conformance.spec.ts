import { describe, it } from 'vitest';
import { expectConformingDescriptors } from '../../../shared/sources/descriptor-conformance.spec-helper';
import { FF_WEEKLY_DESCRIPTOR } from './forex-factory.source';
import { MOSPI_DESCRIPTOR, RBI_DESCRIPTOR } from './india-schedule.source';

describe('calendar source descriptors', () => {
  it('declare id, owner, limits, schedule, terms and docs', () => {
    expectConformingDescriptors([FF_WEEKLY_DESCRIPTOR, RBI_DESCRIPTOR, MOSPI_DESCRIPTOR], 'calendar');
  });
});
