#!/bin/bash

echo ""
echo "=============================================="
echo "   Dilux Database Backup Solution"
echo "   Development Environment"
echo "=============================================="
echo ""

# ==============================================
# 1. Fix permissions BEFORE checking services
# ==============================================
# Docker containers (mysql, postgres) run as internal users (UID ~999)
# They need world-readable permissions on mounted files
# This runs on every start to catch newly added files

echo "Fixing file permissions..."

# SQL init scripts - mounted into MySQL/PostgreSQL containers
if [ -d "tools/db-init" ]; then
    chmod 644 tools/db-init/mysql/*.sql 2>/dev/null || true
    chmod 644 tools/db-init/postgres/*.sql 2>/dev/null || true
    chmod 644 tools/db-init/*.sql 2>/dev/null || true
    echo "  [OK] SQL init scripts (644)"
fi

# Shell scripts - need to be executable
chmod +x .devcontainer/scripts/*.sh 2>/dev/null || true
chmod +x tools/*.sh 2>/dev/null || true

echo ""

# ==============================================
# 2. Check services status
# ==============================================
echo "Checking services status..."
echo ""

check_service() {
    local name=$1
    local host=$2
    local port=$3

    if nc -z "$host" "$port" 2>/dev/null; then
        echo "  [OK] $name"
    else
        echo "  [!!] $name - waiting..."
        until nc -z "$host" "$port" 2>/dev/null; do sleep 2; done
        echo "  [OK] $name is now ready"
    fi
}

check_service "Azurite"     "azurite"   10000
check_service "MySQL"       "mysql"     3306
check_service "PostgreSQL"  "postgres"  5432
check_service "SQL Server"  "sqlserver" 1433

echo ""

# ==============================================
# 3. Initialize databases if tables don't exist
# ==============================================
echo "Verifying test databases..."

# Function to check if a DB needs initialization
check_mysql_tables() {
    local count=$(docker exec dilux-mysql mysql -u root -pDevPassword123! testdb -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='testdb' AND table_name='users';" 2>/dev/null)
    [ "$count" = "1" ]
}

check_postgres_tables() {
    local count=$(docker exec dilux-postgres psql -U postgres -d testdb -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='users';" 2>/dev/null | tr -d ' ')
    [ "$count" = "1" ]
}

check_sqlserver_tables() {
    local count=$(docker exec dilux-sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P DevPassword123! -d testdb -C -h -1 -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.tables WHERE name='users';" 2>/dev/null | tr -d ' \r\n')
    [ "$count" = "1" ]
}

# MySQL
echo -n "  MySQL: "
if check_mysql_tables; then
    echo "[OK] Tables exist"
else
    echo "[NEEDS INIT]"
    if [ -f "tools/db-init/mysql/init.sql" ]; then
        echo -n "    Initializing MySQL... "
        if cat tools/db-init/mysql/init.sql | docker exec -i dilux-mysql bash -c "mysql -u root -pDevPassword123! testdb" 2>/dev/null; then
            echo "[OK]"
        else
            echo "[FAILED]"
        fi
    fi
fi

# PostgreSQL
echo -n "  PostgreSQL: "
if check_postgres_tables; then
    echo "[OK] Tables exist"
else
    echo "[NEEDS INIT]"
    if [ -f "tools/db-init/postgres/init.sql" ]; then
        echo -n "    Initializing PostgreSQL... "
        if docker exec -i dilux-postgres psql -U postgres -d testdb < tools/db-init/postgres/init.sql >/dev/null 2>&1; then
            echo "[OK]"
        else
            echo "[FAILED]"
        fi
    fi
fi

# SQL Server
echo -n "  SQL Server: "
if check_sqlserver_tables; then
    echo "[OK] Tables exist"
else
    echo "[NEEDS INIT]"
    if [ -f "tools/db-init/sqlserver-init.sql" ]; then
        echo -n "    Initializing SQL Server... "
        if docker exec -i dilux-sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P DevPassword123! -d master -C -i /dev/stdin < tools/db-init/sqlserver-init.sql >/dev/null 2>&1; then
            echo "[OK]"
        else
            echo "[FAILED]"
        fi
    fi
fi

echo ""

echo "=============================================="
echo " All database services are running!"
echo "=============================================="
echo ""

# ==============================================
# 4. Initialize Test Data (Access Requests & Backup History)
# ==============================================
echo "Initializing test data..."

# Wait for Azurite to be fully ready (table service on port 10002)
sleep 2

if python3 .devcontainer/scripts/init-test-data.py 2>/dev/null; then
    echo "  [OK] Test data initialized"
else
    echo "  [WARN] Test data initialization failed (will retry on next start)"
fi
echo ""

# ==============================================
# 5. Start Application Services (Background)
# ==============================================
echo "Starting application services..."
echo ""

PROJECT_DIR="/workspaces/dilux-azure-databases-backup-alpha"
LOG_DIR="$PROJECT_DIR/.devcontainer/logs"
mkdir -p "$LOG_DIR"

# Function to check if a service is actually responding (not zombie)
check_service_healthy() {
    local port=$1
    local check_url=$2

    if [ -n "$check_url" ]; then
        # For HTTP services, check if they respond
        curl -s -o /dev/null -w "%{http_code}" "$check_url" 2>/dev/null | grep -q "200\|404"
    else
        # For non-HTTP services, just check if port is listening
        lsof -i :$port >/dev/null 2>&1
    fi
}

# Function to kill any process on a port
kill_port() {
    local port=$1
    local pid=$(lsof -t -i :$port 2>/dev/null)
    if [ -n "$pid" ]; then
        kill -9 $pid 2>/dev/null
        sleep 1
    fi
}

# Function to start a service, killing zombies if needed
start_service() {
    local name=$1
    local port=$2
    local dir=$3
    local cmd=$4
    local health_url=$5
    local log_file="$LOG_DIR/${name,,}.log"

    echo -n "  $name (port $port): "

    # Check if service is running AND healthy
    if lsof -i :$port >/dev/null 2>&1; then
        if check_service_healthy "$port" "$health_url"; then
            echo "[OK] running"
            return 0
        else
            # Port occupied but not responding = zombie
            echo -n "[ZOMBIE] killing... "
            kill_port $port
        fi
    fi

    # Start the service
    echo -n "starting... "

    # Use setsid for process independence, redirect output to log
    cd "$dir" && setsid bash -c "$cmd > '$log_file' 2>&1" &

    # Wait for service to be ready (max 20 seconds)
    local count=0
    while [ $count -lt 20 ]; do
        sleep 1
        count=$((count + 1))
        if check_service_healthy "$port" "$health_url"; then
            echo "[OK]"
            return 0
        fi
    done

    echo "[FAILED - check $log_file]"
    return 1
}

# Start services with health check URLs (5th param)
# Health URL is used to verify service is responding, not just port open

start_service "API" 7071 "$PROJECT_DIR/src/functions/api" "func start --port 7071" "http://localhost:7071/api/health"
start_service "Scheduler" 7072 "$PROJECT_DIR/src/functions/scheduler" "func start --port 7072" ""
start_service "Processor" 7073 "$PROJECT_DIR/src/functions/processor" "func start --port 7073" ""
start_service "Frontend" 3000 "$PROJECT_DIR/src/frontend" "npm run dev" "http://localhost:3000"

echo ""
echo "=============================================="
echo " All services started!"
echo "=============================================="
echo ""
echo " Service URLs:"
echo "   Frontend:  http://localhost:3000"
echo "   API:       http://localhost:7071/api/health"
echo "   Scheduler: http://localhost:7072 (timer triggers)"
echo "   Processor: http://localhost:7073 (queue trigger)"
echo ""
echo " Logs: $LOG_DIR/"
echo ""
echo " To stop services: pkill -f 'func start' && pkill -f 'vite'"
echo ""
