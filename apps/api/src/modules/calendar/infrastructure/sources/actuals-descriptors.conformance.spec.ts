import { describe, it } from 'vitest';
import { expectConformingDescriptors } from '../../../../shared/sources/descriptor-conformance.spec-helper';
import { FF_EVENT_SPECS_DESCRIPTOR } from './ff-event-specs.source';
import { FRED_DESCRIPTOR } from './fred.source';
import { RBI_ACTUALS_DESCRIPTOR } from './rbi-actuals.source';

describe('calendar actuals and knowledge source descriptors', () => {
  it('declare id, owner, limits, schedule, terms and docs', () => {
    expectConformingDescriptors([FF_EVENT_SPECS_DESCRIPTOR, FRED_DESCRIPTOR, RBI_ACTUALS_DESCRIPTOR], 'calendar');
  });
});
