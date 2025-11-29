#!/bin/bash

echo ""
echo "=============================================="
echo "   Dilux Database Backup Solution"
echo "   Development Environment"
echo "=============================================="
echo ""

# Verificar servicios
echo "Checking services status..."
echo ""

# Verificar Azurite
if nc -z azurite 10000 2>/dev/null; then
    echo "  [OK] Azurite (Azure Storage Emulator)"
else
    echo "  [!!] Azurite - Not ready yet, waiting..."
    until nc -z azurite 10000 2>/dev/null; do
        sleep 2
    done
    echo "  [OK] Azurite is now ready"
fi

# Verificar MySQL
if nc -z mysql 3306 2>/dev/null; then
    echo "  [OK] MySQL"
else
    echo "  [!!] MySQL - Not ready yet, waiting..."
    until nc -z mysql 3306 2>/dev/null; do
        sleep 2
    done
    echo "  [OK] MySQL is now ready"
fi

# Verificar PostgreSQL
if nc -z postgres 5432 2>/dev/null; then
    echo "  [OK] PostgreSQL"
else
    echo "  [!!] PostgreSQL - Not ready yet, waiting..."
    until nc -z postgres 5432 2>/dev/null; do
        sleep 2
    done
    echo "  [OK] PostgreSQL is now ready"
fi

# Verificar SQL Server
if nc -z sqlserver 1433 2>/dev/null; then
    echo "  [OK] SQL Server"
else
    echo "  [!!] SQL Server - Not ready yet (may take ~60s)..."
    until nc -z sqlserver 1433 2>/dev/null; do
        sleep 5
    done
    echo "  [OK] SQL Server is now ready"
fi

echo ""
echo "=============================================="
echo " All services are running!"
echo "=============================================="
echo ""
echo " Quick Start Commands:"
echo ""
echo "   Frontend:"
echo "     cd src/frontend && npm run dev"
echo ""
echo "   Functions API:"
echo "     cd src/functions/api && func start --port 7071"
echo ""
echo "   Functions Scheduler:"
echo "     cd src/functions/scheduler && func start --port 7072"
echo ""
echo "   Functions Processor:"
echo "     cd src/functions/processor && func start --port 7073"
echo ""
echo " Service URLs:"
echo "   React App:       http://localhost:3000"
echo "   Functions API:   http://localhost:7071/api"
echo ""
echo " Database Connections:"
echo "   MySQL:      mysql -h localhost -P 3306 -u root -pDevPassword123! testdb"
echo "   PostgreSQL: PGPASSWORD=DevPassword123! psql -h localhost -p 5432 -U postgres testdb"
echo "   SQL Server: sqlcmd -S localhost,1433 -U sa -P 'DevPassword123!' -d testdb -C"
echo ""
echo " Documentation:"
echo "   docs/dilux-azure-databases-backup-solution.md"
echo "   docs/infra.md"
echo ""
echo "=============================================="
