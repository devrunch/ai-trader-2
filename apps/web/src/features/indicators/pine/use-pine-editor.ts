import { useState } from 'react';
import type { IndicatorDefinition, PineScriptDetail } from '@aitrader/contracts';
import { ApiError } from '../../../shared/api';
import { useIndicatorStore } from '../state/indicator-store';
import { PINE_STARTER } from './pine-starter';
import { usePineDescribe } from './use-pine-describe';
import { usePineScriptOpen, usePineScriptWrites } from './use-pine-scripts';

/** All editor-tab logic: draft, check, save (create then new versions), open a version, add or replace on the chart. */
export function usePineEditor(seed: { source?: string; key?: string }, onDone: () => void) {
  const [source, setSource] = useState(seed.source ?? PINE_STARTER);
  const [name, setName] = useState('My indicator');
  const [saved, setSaved] = useState<PineScriptDetail | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const checker = usePineDescribe();
  const opener = usePineScriptOpen();
  const { create, save } = usePineScriptWrites();
  const { addPine, replacePine } = useIndicatorStore();

  const adopt = (detail: PineScriptDetail) => { setSaved(detail); setName(detail.name); setSource(detail.source); };
  const fail = (error: unknown) => { setSaveError(error instanceof ApiError ? error.message : 'Could not save the script'); };

  return {
    source, name, saved, saveError, checker, replacing: seed.key !== undefined,
    busy: checker.pending || create.isPending || save.isPending || opener.isPending,
    setName, setSource: (value: string) => { setSource(value); setSaveError(null); },
    /** Loads a saved script (from My scripts) or one of its versions into the editor. */
    load: (detail: PineScriptDetail) => { checker.reset(); setSaveError(null); adopt(detail); },
    check: async () => { try { await checker.describe(source); } catch { /* shown through checker.problem */ } },
    save: async () => {
      setSaveError(null);
      try { adopt(saved ? await save.mutateAsync({ id: saved.id, name, source }) : await create.mutateAsync({ name, source })); } catch (error) { fail(error); }
    },
    openVersion: async (version: number) => {
      if (!saved) return;
      try { adopt(await opener.mutateAsync({ id: saved.id, version })); checker.reset(); } catch (error) { fail(error); }
    },
    addToChart: async (text = source) => {
      let definition: IndicatorDefinition;
      try { definition = await checker.describe(text); } catch { return; }
      if (seed.key === undefined) addPine(text, definition); else replacePine(seed.key, text, definition);
      onDone();
    },
  };
}
