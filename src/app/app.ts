import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToolbarComponent } from './core/ui/toolbar/toolbar';
import { AppwriteAuthService } from './core/appwrite/appwrite-auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToolbarComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('news-map-frontend');

  constructor(auth: AppwriteAuthService) {
    auth.loadSession();
  }
}
