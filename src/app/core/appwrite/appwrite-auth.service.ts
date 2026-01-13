import { Injectable } from '@angular/core';
import { Models, Account, ID, OAuthProvider } from 'appwrite';
import { authUser } from './auth.store';
import { appwriteClient } from './appwrite.client';
import { LoginResult } from './appwrite-login-dialog/appwrite-login-dialog';

@Injectable({ providedIn: 'root' })
export class AppwriteAuthService {
  private account = new Account(appwriteClient);

  async loadSession() {
    const p = new URLSearchParams(window.location.search);
    const userId = p.get('userId');
    const secret = p.get('secret');
    if (userId && secret) {
      this.account.createSession({ userId, secret }).then((sess) => {
        appwriteClient.setSession(sess.secret);
        window.history.replaceState({}, '', '/');
        this.account.get().then((me) => {
          this.setUser(me);
        });
      });
    }
  }
  /*
    try {
      this.setUser(await this.account.get());
    } catch {
      this.setUser(null);
    }
  }
*/

  async login(result: LoginResult) {
    if (!result) return;
    try {
      if (result.provider === 'google') {
        this.account.createOAuth2Token(
          OAuthProvider.Google,
          document.location.toString(),
          origin + '/error'
        );
      } else if (result.provider === 'github') {
        this.account.createOAuth2Token(
          OAuthProvider.Github,
          document.location.toString(),
          origin + '/error'
        );
      } else if (result.provider === 'email') {
        const email = result.email!;
        const pass = result.password!;
        if (email && pass) {
          this.account.createEmailToken(email, pass);
        } else {
          alert('No data provided');
        }
      } else if (result.provider === 'register') {
        const email = result.email!;
        const pass = result.password!;
        if (email && pass) {
          this.account.create('unique()', email, pass, email);
        } else {
          alert('No data provided');
        }
      } else if (result.provider === 'reset') {
        const email = result.email!;
        if (email) {
          this.account.createRecovery(email, document.location.toString());
        }
      }
    } catch (error) {
      console.error('Error al iniciar sesión con Firebase:', error);
      this.setUser(null);
    }
  }

  async logout() {
    await this.account.deleteSession('current');
    authUser.set(null);
  }

  private async setUser(user: Models.User<any> | null) {
    if (user) {
      const token = '';
      const userInfo = {
        id: user.$id,
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        authenticated: true,
        token,
        roles: user.labels,
      };
      authUser.set(userInfo);
    } else {
      authUser.set(null);
    }
  }
}
