/**
 * Navigatie via het adres, zonder router-bibliotheek.
 *
 * Het adres is een deel van de app: een trainingsblad wil je kunnen bewaren als
 * snelkoppeling op je beginscherm, en dan moet het adres na het opnieuw openen
 * nog steeds hetzelfde scherm opleveren. Vandaar hashes en geen toestand in het
 * geheugen.
 */

import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { name: 'today' }
  | { name: 'trainings' }
  | { name: 'training'; id: string }
  | { name: 'sheet'; id: string }
  | { name: 'library' }
  | { name: 'exercise'; id: string }
  | { name: 'exercise-edit'; id: string }
  | { name: 'series' }
  | { name: 'series-detail'; id: string }
  | { name: 'manage' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [first, second, third] = parts;
  switch (first) {
    case undefined:
    case 'vandaag':
      return { name: 'today' };
    case 'trainingen':
      return { name: 'trainings' };
    case 'training':
      if (!second) return { name: 'trainings' };
      return third === 'blad' ? { name: 'sheet', id: second } : { name: 'training', id: second };
    case 'bank':
      return { name: 'library' };
    case 'oefening':
      if (!second) return { name: 'library' };
      return third === 'bewerken'
        ? { name: 'exercise-edit', id: second }
        : { name: 'exercise', id: second };
    case 'reeksen':
      return second ? { name: 'series-detail', id: second } : { name: 'series' };
    case 'beheer':
      return { name: 'manage' };
    default:
      return { name: 'today' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'today':
      return '#/vandaag';
    case 'trainings':
      return '#/trainingen';
    case 'training':
      return `#/training/${route.id}`;
    case 'sheet':
      return `#/training/${route.id}/blad`;
    case 'library':
      return '#/bank';
    case 'exercise':
      return `#/oefening/${route.id}`;
    case 'exercise-edit':
      return `#/oefening/${route.id}/bewerken`;
    case 'series':
      return '#/reeksen';
    case 'series-detail':
      return `#/reeksen/${route.id}`;
    case 'manage':
      return '#/beheer';
  }
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(typeof location === 'undefined' ? '' : location.hash),
  );

  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);

  const go = useCallback((next: Route) => {
    location.hash = href(next);
  }, []);

  return [route, go];
}

/** Terug, maar nooit de app uit: zonder geschiedenis naar het overzicht. */
export function goBack(fallback: Route): void {
  if (history.length > 1) history.back();
  else location.hash = href(fallback);
}
