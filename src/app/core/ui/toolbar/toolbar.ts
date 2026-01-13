import { Component, inject } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { AppwriteAuthService } from '../../appwrite/appwrite-auth.service';
import { authUser } from '../../appwrite/auth.store';
import { AppwriteLoginDialogComponent } from '../../appwrite/appwrite-login-dialog/appwrite-login-dialog';

@Component({
  selector: 'app-toolbar',
  imports: [MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class ToolbarComponent {
  private dialog = inject(MatDialog);
  private auth = inject(AppwriteAuthService);

  user = authUser;

  openLogin() {
    const ref = this.dialog.open(AppwriteLoginDialogComponent , {
      width: '420px',
    });

    ref.afterClosed().subscribe(async (result) => {
      this.auth.login(result);
    });
  }

  logout() {
    this.auth.logout();
  }
}
