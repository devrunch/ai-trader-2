type Built<S> = { ok: true; spec: S } | { ok: false; error: string };

/** The spec to run: built from the simple form, or the advanced spec the form cannot show. */
export function draftSpec<F, S>(form: F | null, advanced: S | null, build: (form: F) => Built<S>): { spec: S } | { error: string } {
  if (form) { const built = build(form); return built.ok ? { spec: built.spec } : { error: built.error }; }
  return advanced ? { spec: advanced } : { error: 'Nothing to run.' };
}
