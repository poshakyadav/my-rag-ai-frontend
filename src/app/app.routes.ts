import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/chat/chat-shell/chat-shell').then((m) => m.ChatShellComponent),
    children: [
      {
        path: 'session/:id',
        loadComponent: () =>
          import('./features/chat/chat-view/chat-view').then((m) => m.ChatViewComponent),
      },
      {
        path: '',
        loadComponent: () =>
          import('./features/chat/chat-view/chat-view').then((m) => m.ChatViewComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
