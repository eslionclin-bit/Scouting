/**
 * Het referentieniveau waar de cijfers naast komen te staan.
 *
 * Zijn er scoutbestanden ingelezen, dan is de referentie berekend uit die
 * wedstrijden. Zo niet, dan blijven de indicatieve waarden staan — met dat
 * woord erbij op het scherm, want het verschil tussen geteld en geschat hoort
 * zichtbaar te zijn.
 */

import { useMemo } from 'react';
import { computeReference, TOP_LEVEL, type ComputedReference, type ReferenceLevel } from '../../analysis';
import { loadMatchBundle } from '../../db/bundle';
import { useQuery } from '../StoreProvider';

export interface ReferenceState {
  level: ReferenceLevel;
  computed: ComputedReference | null;
  loading: boolean;
}

export function useReference(): ReferenceState {
  const { data } = useQuery(async (store) => {
    const matches = await store.matches.listReference();
    return Promise.all(matches.map((match) => loadMatchBundle(store, match.id)));
  }, []);

  const computed = useMemo(() => (data ? computeReference(data) : null), [data]);

  return {
    level: computed?.level ?? TOP_LEVEL,
    computed,
    loading: data === undefined,
  };
}
