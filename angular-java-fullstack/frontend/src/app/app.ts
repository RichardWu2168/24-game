import { Component } from '@angular/core';
import { GameScreen } from './features/game/game-screen';

@Component({
  imports: [GameScreen],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
