# Leitfaden zur Implementierung CORS-kompatibler API-Endpunkte

## Problemstellung

Bei der Entwicklung von Web-APIs treten häufig CORS-Probleme (Cross-Origin Resource Sharing) auf, insbesondere wenn Frontend und Backend auf verschiedenen Domains oder Ports laufen. Diese Probleme äußern sich meist in Form von Fehlermeldungen wie:

```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource. (Reason: CORS header 'Access-Control-Allow-Origin' missing)
```

Solche Fehler können auftreten, wenn:

1. CORS-Header nicht korrekt konfiguriert sind
2. Authentifizierung auf Serverebene (z.B. durch einen Reverse-Proxy wie Nginx) blockiert OPTIONS-Anfragen
3. Komplexe Anfragen mit benutzerdefinierten Headers gesendet werden

## Unsere Lösung

Wir haben eine robuste Methode entwickelt, um diese CORS-Probleme zu umgehen, ohne die Serverkonfiguration (CORS-Header oder Authentifizierung) ändern zu müssen:

### 1. FormData statt JSON verwenden

Der grundlegende Ansatz besteht darin, für Anfragen FormData anstelle von JSON zu verwenden. FormData-Anfragen verhalten sich anders im Kontext von CORS und können in vielen Fällen die Pre-flight OPTIONS-Anfrage umgehen.

### 2. Content-Type-Header vermeiden

Bei FormData-Anfragen sollte kein Content-Type-Header manuell gesetzt werden. Der Browser setzt automatisch den richtigen Content-Type mit boundary-Parameter.

## Implementierungsschritte

### Backend-Implementierung (FastAPI)

```python
from fastapi import APIRouter, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from database.db import get_db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/resource",
    tags=["resource"]
)

@router.post("/update-resource", response_model=ResourceResponse)
async def update_resource(
    id: int = Form(...),  # Pflichtfeld mit '...'
    name: str = Form(None),  # Optionales Feld mit Default None
    description: str = Form(None),
    type: str = Form(None),
    status: str = Form(None),
    db: Session = Depends(get_db)
):
    """Update eine Ressource mit FormData anstatt JSON."""
    try:
        logger.info(f"Anfrage zum Aktualisieren der Ressource mit ID: {id}")
        
        # Ressource aus Datenbank holen
        resource = db.query(ResourceDB).filter(ResourceDB.id == id).first()
        if not resource:
            logger.error(f"Ressource mit ID {id} nicht gefunden")
            raise HTTPException(status_code=404, detail="Ressource nicht gefunden")
        
        # Update-Daten sammeln
        update_data = {}
        
        # Nur gesetzte Felder hinzufügen
        if name:
            update_data['name'] = name
        if description:
            update_data['description'] = description
        if type:
            try:
                update_data['type'] = ResourceType(type)  # Enum-Konvertierung
            except ValueError:
                logger.warning(f"Ungültiger Typ: {type}")
        if status:
            try:
                update_data['status'] = ResourceStatus(status)  # Enum-Konvertierung
            except ValueError:
                logger.warning(f"Ungültiger Status: {status}")
        
        logger.info(f"Update-Daten: {update_data}")
        
        # Felder aktualisieren
        updated_fields = []
        for key, value in update_data.items():
            if hasattr(resource, key):
                setattr(resource, key, value)
                updated_fields.append(key)
            else:
                logger.warning(f"Feld nicht im Modell gefunden: {key}")
        
        # Änderungen speichern
        db.commit()
        db.refresh(resource)
        
        logger.info(f"Ressource aktualisiert: {updated_fields}")
        
        return ResourceResponse.model_validate(resource)
        
    except Exception as e:
        logger.error(f"Fehler beim Aktualisieren der Ressource: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
```

### Frontend-Implementierung (JavaScript)

```javascript
// API-Hilfsfunktionen
const API_BASE_URL = 'https://api.example.com';
const API_PATHS = {
    RESOURCES: '/api/resources/'
};

// Allgemeine Fetch-Funktion
async function fetchApi(endpoint, options = {}) {
    const fullUrl = `${API_BASE_URL}${endpoint}`;
    console.log(`Making ${options.method || 'GET'} request to:`, fullUrl);
    
    const fetchOptions = {
        mode: 'cors',
        credentials: 'include',
        headers: {
            'Accept': 'application/json',
            ...options.headers
        },
        ...options
    };
    
    // Content-Type-Header für FormData entfernen
    if (options.body instanceof FormData) {
        delete fetchOptions.headers['Content-Type'];
        console.log('FormData detected, removing Content-Type header');
    }
    
    try {
        const response = await fetch(fullUrl, fetchOptions);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const errorMessage = errorData?.detail || `HTTP error! status: ${response.status}`;
            console.error('API Error:', errorMessage);
            throw new Error(errorMessage);
        }
        
        // Für DELETE-Anfragen, die kein JSON zurückgeben
        if (response.status === 204 || options.method === 'DELETE') {
            return { success: true };
        }
        
        // Überprüfen, ob die Antwort leer ist
        const text = await response.text();
        if (!text) {
            return [];
        }
        
        return JSON.parse(text);
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Ressourcen-API-Funktionen
export const resourceApi = {
    // Bestehende Methoden...
    
    async update(id, data) {
        // FormData für CORS-kompatiblen Request erstellen
        const formData = new FormData();
        
        // ID ist immer erforderlich
        formData.append('id', id);
        
        // Nur definierte Daten hinzufügen
        if (data.name) formData.append('name', data.name);
        if (data.description) formData.append('description', data.description);
        if (data.type) formData.append('type', data.type);
        if (data.status) formData.append('status', data.status);
        
        // Request ohne Content-Type-Header senden
        return fetchApi(`${API_PATHS.RESOURCES}update-resource`, {
            method: 'POST',
            body: formData
        });
    }
};
```

## Verwendung in Komponenten

```javascript
async function updateResource(resourceId, resourceData) {
    try {
        const updatedResource = await resourceApi.update(resourceId, resourceData);
        console.log('Resource updated:', updatedResource);
        return updatedResource;
    } catch (error) {
        console.error('Failed to update resource:', error);
        // Fehlerbehandlung
    }
}
```

## Vorteile dieser Methode

1. **Umgehung von CORS-Problemen**: Diese Methode funktioniert oft in Umgebungen mit strengen CORS-Einschränkungen.

2. **Keine Serverkonfigurationsänderungen**: Keine Notwendigkeit, Nginx oder andere Proxy-Server zu rekonfigurieren.

3. **Kompatibilität**: Funktioniert mit verschiedenen Browsern und in verschiedenen Umgebungen.

4. **Einfache Implementierung**: Die Umstellung erfordert nur minimale Änderungen im Code.

## Einschränkungen

1. **Komplexe Datenstrukturen**: Für tief verschachtelte Objekte oder Arrays müssen Sie spezielle Serialisierungskonventionen entwickeln.

2. **Dateiuploads**: Wenn Sie bereits Dateien hochladen, müssen Sie beachten, dass Sie FormData bereits für diesen Zweck verwenden.

3. **Endpunktkonvention**: Erfordert eine konsistente Benennung und Strukturierung von Endpunkten.

## Anwendung auf bestehende Endpunkte

Wenn Sie einen bestehenden JSON-basierten Endpunkt zu FormData konvertieren möchten:

1. **Backend**: Ersetzen Sie den Body-Parameter durch einzelne Form-Parameter.
2. **Frontend**: Erstellen Sie FormData und fügen Sie jedes Feld einzeln hinzu.
3. **Dokumentation**: Dokumentieren Sie die neue Schnittstelle.

## Fehlerbehebung

Wenn die Methode nicht funktioniert:

1. **Überprüfen Sie den Network-Tab**: Achten Sie auf den Content-Type-Header und die FormData in der Anfrage.
2. **Prüfen Sie Status-Codes**: Ein 401 könnte auf Authentifizierungsprobleme hinweisen.
3. **Server-Logs prüfen**: Backend-Logs können zusätzliche Einblicke geben.

---

Diese Methode hat uns geholfen, hartnäckige CORS-Probleme zu lösen, ohne die Serverkonfiguration ändern zu müssen. Sie ist besonders nützlich in Umgebungen, in denen Sie keine direkte Kontrolle über die Infrastruktur haben. 