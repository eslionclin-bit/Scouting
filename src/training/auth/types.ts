/** Wat de app van een account weet. Het wachtwoord komt hier nooit voorbij. */

export type Role = 'owner' | 'trainer';

export interface Account {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Session {
  token: string;
  expiresAt: string;
  user: Account;
}

export interface ServerStatus {
  /** Er is nog geen enkel account: de eerste keer mag jij de eigenaar worden. */
  setupNeeded: boolean;
  users: number;
}
