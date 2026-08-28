/**
 * De deur: wat er op het scherm staat zolang er niet is ingelogd.
 *
 * Staat bewust vóór de opslag. Welke database opengaat hangt af van wie er
 * inlogt — elk account heeft er een eigen — dus is er niets te openen zolang
 * dat niet vaststaat. Is er geen deelserver ingesteld, dan valt er ook niets te
 * controleren en gaat alles gewoon open; dat is de stand voor wie de app alleen
 * op zijn eigen telefoon gebruikt.
 */

import type { ReactNode } from 'react';
import { LoginScreen } from '../app/screens/LoginScreen';
import { useAuth } from './AuthProvider';

export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth();

  if (state.kind === 'loading') return <div className="boot">Bezig met openen…</div>;
  if (state.kind === 'setup' || state.kind === 'anonymous') return <LoginScreen />;
  return <>{children}</>;
}
