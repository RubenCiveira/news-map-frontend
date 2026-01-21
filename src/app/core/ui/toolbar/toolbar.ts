import { Component, computed, inject, Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { AppwriteAuthService } from '../../appwrite/appwrite-auth.service';
import { authUser } from '../../appwrite/auth.store';
import { AppwriteLoginDialogComponent } from '../../appwrite/appwrite-login-dialog/appwrite-login-dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

import { TimeFilter, TimeFilterService, TimePreset } from '../../time-filter.service';
import { MatFormField, MatInputModule, MatLabel } from '@angular/material/input';


@Component({
  selector: 'app-toolbar',
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatFormField, MatLabel, MatSelectModule, 
    MatDatepickerModule, MatNativeDateModule, MatInputModule],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class ToolbarComponent {
  private dialog = inject(MatDialog);
  private auth = inject(AppwriteAuthService);

  user = authUser;

  readonly timePresets: Array<{ value: TimePreset; label: string }> = [
    { value: '15d', label: 'Últimos 15 días' },
    { value: '30d', label: 'Últimos 30 días' },
    { value: '90d', label: 'Últimos 90 días' },
    { value: 'custom', label: 'Personalizado' },
  ];

  // Por defecto: últimos 15 días
  readonly timeFilter: Signal<TimeFilter>;

  // Para Material date-range-input
  readonly customRange: Signal<{ start: Date | null; end: Date | null }>;

  readonly isCustom = computed(() => this.timeFilter().preset === 'custom' );

  constructor(public readonly time: TimeFilterService) {
    this.timeFilter = toSignal( time.timeFilter$, {
        initialValue: time.buildPresetFilter( '15d' ), // TimeFilter
    } );
    this.customRange = signal<{ start: Date | null; end: Date | null }>({
      start: this.timeFilter().from,
      end: this.timeFilter().to,
    });
  }

  openLogin() {
    const ref = this.dialog.open(AppwriteLoginDialogComponent, {
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
