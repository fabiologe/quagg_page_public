# Quagg Client

Vue 3 Frontend-Anwendung für das Quagg-Projekt.

## Struktur

```
client/
├── public/              # Statische Dateien
│   └── index.html
├── src/
│   ├── assets/         # Bilder, globale CSS-Dateien
│   ├── components/     # Globale, wiederverwendbare Komponenten
│   │   ├── base/       # UI-Bausteine (BaseButton, BaseInput, etc.)
│   │   └── layout/     # Layout-Komponenten (InternLayout, ClientLayout, PublicLayout)
│   ├── features/       # Fachlogik-Module
│   │   ├── auth/       # Authentifizierung
│   │   ├── projects/   # Projekt-Management
│   │   └── documents/  # Dokumenten-Management
│   ├── router/         # Vue Router Konfiguration
│   ├── services/       # API-Services (zentrale Axios-Instanz)
│   ├── store/          # Pinia State Management
│   ├── utils/          # Utility-Funktionen
│   ├── views/          # Seiten-Komponenten
│   │   ├── intern/     # Interne Views
│   │   ├── client/     # Kunden-Views
│   │   └── shared/     # Geteilte Views
│   ├── App.vue         # Haupt-Wrapper
│   └── main.js         # App-Startpunkt
├── .env.development    # Entwicklungsumgebung
├── .env.production     # Produktionsumgebung
├── package.json
└── vite.config.js
```

## Installation

```bash
npm install
```

## Entwicklung

```bash
npm run dev
```

Die Anwendung läuft dann auf `http://localhost:3000`

## Build

```bash
npm run build
```

## Features

- **Vue 3** mit Composition API
- **Vite** als Build-Tool
- **Vue Router** für Navigation
- **Pinia** für State Management
- **Axios** für API-Kommunikation
- **Layout-System** für verschiedene Benutzertypen (Intern, Client, Public)

## Authentifizierung

Die Authentifizierung wird über Pinia Store (`store/auth.js`) verwaltet. Der Router prüft automatisch, ob eine Route Authentifizierung benötigt.

## API-Konfiguration

Die API-Base-URL wird über Umgebungsvariablen konfiguriert:
- Entwicklung: `VITE_API_BASE_URL=http://localhost:8000/api`
- Produktion: `VITE_API_BASE_URL=/api`

