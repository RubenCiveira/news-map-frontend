import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';

export interface LoginResult {
  provider: string;
  email?: string;
  password?: string;
}

@Component({
  selector: 'app-appwrite-login-dialog',
  templateUrl: './appwrite-login-dialog.html',
  styleUrl: './appwrite-login-dialog.scss',
  imports: [
    MatDialogModule,
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule,
  ],
})
export class AppwriteLoginDialogComponent {
  layer = 'email';
  email = '';
  password = '';
  confirmPassword = '';

  availableProviders: string[] = ['email', 'google', 'github'];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { providers: string[] },
    private dialogRef: MatDialogRef<AppwriteLoginDialogComponent>,
  ) {
    // this.availableProviders = data.providers;
    this.availableProviders = ['email', 'google', 'github'];
  }

  showLogin() {
    this.layer = 'email';
    return false;
  }

  showRegister() {
    this.layer = 'register';
    return false;
  }

  showReset() {
    this.layer = 'reset';
    return false;
  }

  login(provider: string) {
    const result: LoginResult = { provider };

    if (provider === 'email') {
      result.email = this.email;
      result.password = this.password;
    }

    this.dialogRef.close(result);
  }

  register() {
    this.dialogRef.close({ provider: 'register' });
  }

  canUseEmail() {
    return true;
  }

  canRegister() {
    return true;
  }

  getProviderIcon(providerId: string): string {
    switch (providerId) {
      case 'google':
        return 'g_translate';
      case 'github':
        return 'code';
      case 'facebook':
        return 'facebook';
      case 'twitter':
        return 'flutter_dash';
      case 'email':
        return 'email';
      default:
        return 'login';
    }
  }

  getProviderName(providerId: string): string {
    switch (providerId) {
      case 'google':
        return 'Google';
      case 'github':
        return 'GitHub';
      case 'facebook':
        return 'Facebook';
      case 'twitter':
        return 'Twitter';
      case 'email':
        return 'Email y contraseña';
      default:
        return providerId;
    }
  }
}
