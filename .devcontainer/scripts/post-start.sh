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
# 4. Start Application Services (Background)
# ==============================================
echo "Starting application services..."
echo ""

PROJECT_DIR="/workspaces/dilux-azure-databases-backup-alpha"
LOG_DIR="$PROJECT_DIR/.devcontainer/logs"
mkdir -p "$LOG_DIR"

# Function to start a service if not already running
start_service() {
    local name=$1
    local port=$2
    local dir=$3
    local cmd=$4
    local log_file="$LOG_DIR/$name.log"

    if lsof -i :$port >/dev/null 2>&1; then
        echo "  [OK] $name already running on port $port"
    else
        echo -n "  Starting $name on port $port... "
        cd "$dir"
        nohup $cmd > "$log_file" 2>&1 &

        # Wait for service to be ready (max 30 seconds)
        local count=0
        while ! lsof -i :$port >/dev/null 2>&1 && [ $count -lt 30 ]; do
            sleep 1
            count=$((count + 1))
        done

        if lsof -i :$port >/dev/null 2>&1; then
            echo "[OK]"
        else
            echo "[FAILED - check $log_file]"
        fi
        cd "$PROJECT_DIR"
    fi
}

# Start API (required for frontend proxy)
start_service "API" 7071 "$PROJECT_DIR/src/functions/api" "func start --port 7071"

# Start Processor (handles backup jobs from queue)
start_service "Processor" 7073 "$PROJECT_DIR/src/functions/processor" "func start --port 7073"

# Start Frontend
start_service "Frontend" 3000 "$PROJECT_DIR/src/frontend" "npm run dev"

echo ""
echo "=============================================="
echo " All services started!"
echo "=============================================="
echo ""
echo " Service URLs:"
echo "   Frontend:  http://localhost:3000"
echo "   API:       http://localhost:7071/api/health"
echo "   Processor: http://localhost:7073 (queue trigger)"
echo ""
echo " Logs: $LOG_DIR/"
echo ""
echo " To stop services: pkill -f 'func start' && pkill -f 'vite'"
echo ""
