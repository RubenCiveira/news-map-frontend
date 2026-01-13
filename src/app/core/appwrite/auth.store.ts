import { signal } from '@angular/core';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  authenticated: boolean;
  token: string;
  roles: string[]; 
}

export const authUser = signal<AuthUser | null>(null);
export const isLoggedIn = () => !!authUser();
