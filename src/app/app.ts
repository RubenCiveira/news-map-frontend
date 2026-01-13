import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToolbarComponent } from './core/ui/toolbar/toolbar';
import { MapComponent } from './features/news-map/map/map';
import { AppwriteAuthService } from './core/appwrite/appwrite-auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToolbarComponent, MapComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('news-map-frontend');

  constructor(auth: AppwriteAuthService) {
    auth.loadSession();
  }
}
