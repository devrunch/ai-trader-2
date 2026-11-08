const apiRoot = '(?:apps/api/src|tools/gates/fixtures/[^/]+)';
const webRoot = '(?:apps/web/src|tools/gates/fixtures/[^/]+)';
const rule = (name, from, to) => ({ name, severity: 'error', from, to });

module.exports = {
  forbidden: [
    rule('domain-no-framework', { path: `^(${apiRoot}/modules/[^/]+/domain/)` }, {
      pathNot: ['^$1', '(?:^|/)@aitrader/contracts(?:/|$)', '^packages/contracts/', 'node_modules/date-fns/', 'node_modules/@date-fns/tz/'],
    }),
    rule('application-no-infrastructure', { path: `${apiRoot}/modules/[^/]+/application/` }, {
      path: `${apiRoot}/modules/[^/]+/(?:infrastructure|api)/`,
    }),
    rule('api-application-only', { path: `${apiRoot}/modules/[^/]+/api/` }, {
      path: `${apiRoot}/modules/[^/]+/(?:infrastructure|domain)/`,
    }),
    rule('infrastructure-no-api', { path: `${apiRoot}/modules/[^/]+/infrastructure/` }, {
      path: `${apiRoot}/modules/[^/]+/api/`,
    }),
    rule('module-public-api-only', { path: `^(${apiRoot}/modules/)([^/]+)/` }, {
      path: '^$1', pathNot: ['^$1$2/', '^$1[^/]+/application/index\\.ts$'],
    }),
    rule('shared-no-modules', { path: `${apiRoot}/shared/` }, { path: `${apiRoot}/modules/` }),
    rule('no-circular', {}, { circular: true }),
    rule('web-feature-public-api-only', { path: `^(${webRoot}/features/)([^/]+)/` }, {
      path: '^$1', pathNot: ['^$1$2/', '^$1[^/]+/index\\.ts$'],
    }),
    rule('web-shared-no-features', { path: `${webRoot}/shared/` }, { path: `${webRoot}/features/` }),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(?:dist|coverage)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.json'] },
  },
};
