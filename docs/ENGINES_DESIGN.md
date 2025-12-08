# Engines + Databases Design

**Estado:** ✅ Implementado
**Fecha:** 2025-12-08
**Última actualización:** 2025-12-08

---

## Resumen

Sistema de gestión de credenciales donde cada base de datos pertenece a un "Engine" (servidor). Las credenciales pueden heredarse del Engine o configurarse individualmente por base de datos.

## Principios de Diseño

1. **Toda Database tiene un Engine**: `engine_id` es requerido, nunca nulo
2. **Credenciales heredables**: Las DBs pueden usar credenciales del Engine o propias
3. **Engines implícitos**: Al agregar una DB manual, se crea el Engine automáticamente
4. **Discovery opcional**: Los Engines pueden descubrir sus databases automáticamente
5. **Override no destructivo**: Cambiar credenciales del Engine no afecta DBs con credenciales propias

---

## Modelos de Datos

### Engine (Servidor)

```python
class Engine(BaseModel):
    id: str                          # UUID
    name: str                        # Nombre descriptivo (ej: "Production MySQL")
    engine_type: EngineType          # mysql, postgresql, sqlserver
    host: str                        # Hostname o IP
    port: int                        # Puerto (default según tipo)

    # Autenticación del Engine
    auth_method: AuthMethod          # user_password, managed_identity, azure_ad, connection_string
    username: Optional[str]          # Para user_password
    password: Optional[str]          # Almacenado en Key Vault (prod) o Table Storage (dev)
    connection_string: Optional[str] # Para connection_string auth

    # Metadata
    created_at: datetime
    updated_at: datetime
    last_discovery: Optional[datetime]  # Última vez que se ejecutó discovery
    discovery_enabled: bool = False     # Si tiene credenciales para discovery

class EngineType(str, Enum):
    mysql = "mysql"
    postgresql = "postgresql"
    sqlserver = "sqlserver"

class AuthMethod(str, Enum):
    user_password = "user_password"
    managed_identity = "managed_identity"
    azure_ad = "azure_ad"
    connection_string = "connection_string"
```

### Database (modificado)

```python
class Database(BaseModel):
    id: str                           # UUID
    engine_id: str                    # REQUERIDO - siempre pertenece a un Engine
    name: str                         # Nombre de la base de datos
    alias: str                        # Nombre descriptivo para UI

    # Credenciales
    use_engine_credentials: bool = True  # Si usa las credenciales del Engine

    # Override de credenciales (solo si use_engine_credentials = False)
    auth_method: Optional[AuthMethod]
    username: Optional[str]
    password: Optional[str]
    connection_string: Optional[str]

    # Backup config
    backup_policy_id: Optional[str]
    enabled: bool = True

    # Metadata
    created_at: datetime
    updated_at: datetime
```

---

## Flujos de Usuario

### Flujo 1: Agregar Database Manual (una sola)

```
Usuario quiere agregar "orders_db" en el servidor mysql.example.com
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dialog: "Add Database"                                          │
│                                                                   │
│  Engine:  [Select existing or create new ▼]                      │
│           ┌──────────────────────────────┐                       │
│           │ + Create new engine          │ ← seleccionado        │
│           │ Production MySQL             │                        │
│           │ Staging PostgreSQL           │                        │
│           └──────────────────────────────┘                       │
│                                                                   │
│  --- New Engine Details ---                                       │
│  Engine Name: [Production MySQL        ]                         │
│  Type:        [MySQL ▼]                                          │
│  Host:        [mysql.example.com       ]                         │
│  Port:        [3306                    ]                         │
│                                                                   │
│  --- Database ---                                                 │
│  Database Name: [orders_db             ]                         │
│  Alias:         [Orders Database       ]                         │
│                                                                   │
│  --- Credentials ---                                              │
│  ○ Use engine credentials (for all DBs on this server)           │
│  ● Use specific credentials (only for this database)             │
│                                                                   │
│  Auth Method: [Username/Password ▼]                              │
│  Username:    [orders_user         ]                             │
│  Password:    [••••••••••          ]                             │
│                                                                   │
│  [Test Connection]                    [Cancel] [Save]            │
└─────────────────────────────────────────────────────────────────┘
```

**Resultado:**
1. Se crea Engine "Production MySQL" con host mysql.example.com
2. Engine tiene `discovery_enabled = False` (no tiene credenciales globales)
3. Se crea Database "orders_db" con `use_engine_credentials = False`
4. Credenciales se guardan en la Database, no en el Engine

### Flujo 2: Agregar Engine con Discovery

```
Usuario quiere agregar todas las DBs de un servidor MySQL
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dialog: "Add Engine"                                            │
│                                                                   │
│  Engine Name: [Production MySQL        ]                         │
│  Type:        [MySQL ▼]                                          │
│  Host:        [mysql.example.com       ]                         │
│  Port:        [3306                    ]                         │
│                                                                   │
│  --- Credentials ---                                              │
│  Auth Method: [Username/Password ▼]                              │
│  Username:    [root                ]                             │
│  Password:    [••••••••••          ]                             │
│                                                                   │
│  [Test Connection]                                                │
│                                                                   │
│  ☑ Discover databases on this server                             │
│                                                                   │
│                                          [Cancel] [Save & Discover]│
└─────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼ (después de guardar)

┌─────────────────────────────────────────────────────────────────┐
│  Dialog: "Discovered Databases"                                  │
│                                                                   │
│  Found 5 databases on Production MySQL:                          │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ ☑  orders_db        [Orders DB        ]  [Production ▼]     ││
│  │ ☑  inventory_db     [Inventory        ]  [Production ▼]     ││
│  │ ☑  customers_db     [Customers        ]  [Production ▼]     ││
│  │ ☐  mysql (system)   -                    -                   ││ ← excluir
│  │ ▣  existing_db      (Already exists)     -                   ││ ← greyed out
│  └──────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ☑ Use engine credentials for all selected databases             │
│                                                                   │
│  Selected: 3 databases                   [Cancel] [Add Selected] │
└─────────────────────────────────────────────────────────────────┘
```

**Resultado:**
1. Se crea Engine con credenciales globales (`discovery_enabled = True`)
2. Se crean 3 Databases con `use_engine_credentials = True`
3. Base existente aparece deshabilitada (ya está en el sistema)

### Flujo 3: Cambiar Credenciales de un Engine

```
Usuario edita credenciales del Engine "Production MySQL"
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dialog: "Edit Engine Credentials"                               │
│                                                                   │
│  Engine: Production MySQL                                        │
│  Host:   mysql.example.com:3306                                  │
│                                                                   │
│  --- New Credentials ---                                          │
│  Auth Method: [Username/Password ▼]                              │
│  Username:    [new_admin       ]                                 │
│  Password:    [••••••••••      ]                                 │
│                                                                   │
│  [Test Connection]                                                │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ ℹ️  This engine has 5 databases:                          │   │
│  │    • 3 use engine credentials (will be updated)           │   │
│  │    • 2 have individual credentials (will NOT change)      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ☐ Also update databases with individual credentials             │
│    (Warning: This will overwrite their custom credentials)       │
│                                                                   │
│                                          [Cancel] [Save]         │
└─────────────────────────────────────────────────────────────────┘
```

**Comportamiento:**
- Por defecto: Solo DBs con `use_engine_credentials = True` usan las nuevas credenciales
- Con checkbox: También actualiza DBs con credenciales individuales (cambia a `use_engine_credentials = True`)

### Flujo 4: Database Override Credentials

```
Usuario tiene una DB que usa credenciales del Engine,
pero quiere darle credenciales específicas
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dialog: "Edit Database"                                         │
│                                                                   │
│  Database: orders_db                                             │
│  Engine:   Production MySQL (mysql.example.com)                  │
│                                                                   │
│  Alias: [Orders Database       ]                                 │
│                                                                   │
│  --- Credentials ---                                              │
│  ○ Use engine credentials (inherited from Production MySQL)      │
│  ● Use specific credentials                                       │
│                                                                   │
│  Auth Method: [Username/Password ▼]                              │
│  Username:    [orders_readonly ]                                 │
│  Password:    [••••••••••      ]                                 │
│                                                                   │
│  [Test Connection]                                                │
│                                                                   │
│  --- Backup Policy ---                                            │
│  Policy: [Production Critical ▼]                                 │
│                                                                   │
│                                          [Cancel] [Save]         │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Engines

```
GET    /api/engines                    # Listar todos los engines
GET    /api/engines/{id}               # Obtener un engine
POST   /api/engines                    # Crear engine
PUT    /api/engines/{id}               # Actualizar engine
DELETE /api/engines/{id}               # Eliminar engine (y sus DBs?)

POST   /api/engines/{id}/test          # Test conexión
POST   /api/engines/{id}/discover      # Descubrir databases
PUT    /api/engines/{id}/credentials   # Actualizar credenciales
POST   /api/engines/{id}/apply-credentials  # Aplicar creds a todas las DBs
```

### Databases (modificado)

```
GET    /api/databases                  # Listar (incluye engine info)
GET    /api/databases/{id}             # Obtener (incluye engine info)
POST   /api/databases                  # Crear (engine_id requerido)
PUT    /api/databases/{id}             # Actualizar
DELETE /api/databases/{id}             # Eliminar

POST   /api/databases/{id}/test        # Test conexión (usa sus creds o del engine)
POST   /api/databases/{id}/backup      # Trigger backup manual
```

### Request/Response Examples

**POST /api/engines** (con discovery)
```json
{
  "name": "Production MySQL",
  "engine_type": "mysql",
  "host": "mysql.example.com",
  "port": 3306,
  "auth_method": "user_password",
  "username": "root",
  "password": "secret123",
  "discover_databases": true
}
```

**Response:**
```json
{
  "engine": {
    "id": "eng_123",
    "name": "Production MySQL",
    "engine_type": "mysql",
    "host": "mysql.example.com",
    "port": 3306,
    "discovery_enabled": true,
    "created_at": "2025-12-08T10:00:00Z"
  },
  "discovered_databases": [
    { "name": "orders_db", "exists": false },
    { "name": "inventory_db", "exists": false },
    { "name": "mysql", "system": true },
    { "name": "existing_db", "exists": true }
  ]
}
```

**POST /api/databases** (manual, new engine)
```json
{
  "engine": {
    "name": "Staging Server",
    "engine_type": "postgresql",
    "host": "staging.db.com",
    "port": 5432
  },
  "database": {
    "name": "app_db",
    "alias": "Staging App DB",
    "use_engine_credentials": false,
    "auth_method": "user_password",
    "username": "app_user",
    "password": "secret",
    "backup_policy_id": "pol_456"
  }
}
```

**POST /api/databases** (manual, existing engine)
```json
{
  "engine_id": "eng_123",
  "database": {
    "name": "new_db",
    "alias": "New Database",
    "use_engine_credentials": true,
    "backup_policy_id": "pol_456"
  }
}
```

---

## UI Components

### EnginesPage (nueva)

```
/engines
├── Lista de engines con estadísticas
│   ├── Nombre, tipo, host
│   ├── # de databases
│   ├── Último discovery
│   └── Actions: Edit, Discover, Delete
└── Botón "Add Engine"
```

### DatabasesPage (modificada)

```
/databases
├── Lista de databases (agrupable por engine)
│   ├── Alias, nombre, tipo
│   ├── Engine (clickeable)
│   ├── Credenciales: "Engine" o "Custom"
│   ├── Policy
│   └── Actions: Edit, Backup, Delete
└── Botón "Add Database"
```

### Sidebar (actualizado)

```
Dashboard
Databases      ← ya existe
Engines        ← NUEVO
Backups
Storage
Policies
---
Audit
Settings
Users
Status
```

---

## Migración de Datos

Para bases de datos existentes (sin engine):

1. Crear Engine implícito por cada combinación única de (host, port, type)
2. Asignar `engine_id` a cada Database existente
3. Marcar todas las DBs existentes con `use_engine_credentials = False`
4. Migrar credenciales de Database a su propio campo (ya están ahí)

Script de migración:
```python
def migrate_to_engines():
    databases = get_all_databases()
    engines_map = {}  # (host, port, type) -> engine_id

    for db in databases:
        key = (db.host, db.port, db.engine_type)

        if key not in engines_map:
            # Crear engine implícito
            engine = Engine(
                name=f"{db.engine_type.title()} - {db.host}",
                engine_type=db.engine_type,
                host=db.host,
                port=db.port,
                discovery_enabled=False
            )
            save_engine(engine)
            engines_map[key] = engine.id

        # Actualizar database
        db.engine_id = engines_map[key]
        db.use_engine_credentials = False  # Mantiene sus credenciales
        save_database(db)
```

---

## Consideraciones de Seguridad

1. **Credenciales en Engine**: Acceso a todas las DBs del servidor
   - Solo usuarios Admin pueden crear/editar engines con credenciales
   - Viewer puede ver engines pero no credenciales

2. **Credenciales en Database**: Acceso limitado a una DB
   - Menos riesgo si se compromete

3. **Key Vault (producción)**:
   - Engine credentials: `dilux-engine-{engine_id}`
   - Database credentials: `dilux-db-{database_id}`

4. **Audit logging**:
   - Log cuando se crean/modifican engines
   - Log cuando se usa "Apply credentials to all"
   - Log discovery operations

---

## Preguntas Abiertas

1. **¿Eliminar Engine elimina sus DBs?**
   - Opción A: Sí, cascade delete
   - Opción B: No permitir si tiene DBs
   - Opción C: Preguntar al usuario

2. **¿Mover DB a otro Engine?**
   - ¿Permitir cambiar engine_id de una DB?
   - Implicaciones si usa engine credentials

3. **¿Re-discovery?**
   - ¿Detectar DBs nuevas/eliminadas en el servidor?
   - ¿Sync automático o manual?

---

## Estado de Implementación

Todo lo planificado ha sido implementado:

1. [x] Crear modelo Engine en `shared/models/engine.py`
2. [x] Migrar modelo Database (agregar engine_id, use_engine_credentials)
3. [x] Crear storage service para Engines (`engine_service.py`)
4. [x] Crear API endpoints para Engines (CRUD + discover + test)
5. [x] Modificar API endpoints de Databases (engine_id, use_engine_credentials)
6. [x] Script de migración de datos existentes (`scripts/migrate_to_engines.py`)
7. [x] UI: ServersPage (`/servers`)
8. [x] UI: Modificar DatabasesPage y dialogs (selector de server, toggle credentials)
9. [x] UI: Actualizar sidebar ("Servers" antes de "Databases")
10. [x] API: Test connection soporta engine credentials

### Funcionalidades Implementadas

**Backend:**
- `GET/POST/PUT/DELETE /api/engines` - CRUD completo
- `POST /api/engines/{id}/discover` - Discovery de databases
- `POST /api/engines/{id}/test` - Test de conexión
- `apply_to_all_databases` en PUT - Propaga credenciales a todas las DBs
- `delete_databases` y `delete_backups` en DELETE - Cascade delete

**Frontend:**
- ServersPage con:
  - Lista de servidores con stats
  - Filtros por tipo
  - CRUD con dialogs
  - Discovery dialog para importar databases
  - Delete cascade con confirmación
- DatabaseFormDialog con:
  - Autocomplete de servidor
  - Toggle "Use server credentials"
  - Auto-fill de connection details
  - Test connection con engine credentials
- DatabasesPage con:
  - Columna Server
  - Filtro por servidor
  - engine_name en respuesta API
