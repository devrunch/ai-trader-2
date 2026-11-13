import { describe, it } from 'vitest';
import { expectConformingDescriptors } from '../../../../shared/sources/descriptor-conformance.spec-helper';
import { NEWSAPI_DESCRIPTOR } from './newsapi.source';
import { RSS_DESCRIPTORS } from './rss.source';

describe('news source descriptors', () => {
  it('declare id, owner, limits, schedule, terms and docs', () => {
    expectConformingDescriptors([...RSS_DESCRIPTORS, NEWSAPI_DESCRIPTOR], 'news');
  });
});
