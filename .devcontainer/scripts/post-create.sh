#!/bin/bash
set -e

echo "=============================================="
echo "  Dilux Database Backup - Post-Create Setup"
echo "=============================================="

# 1. Configurar archivo .env si no existe
if [ ! -f .env ]; then
    echo "[1/7] Creating .env from .env.example..."
    cp .env.example .env
else
    echo "[1/7] .env already exists, skipping..."
fi

# 2. Instalar dependencias Python del shared package
echo "[2/7] Installing shared Python dependencies..."
if [ -f "src/shared/requirements.txt" ]; then
    pip install -r src/shared/requirements.txt
fi

# 3. Instalar dependencias de cada Function App
echo "[3/7] Installing Function Apps dependencies..."
for func_dir in src/functions/*/; do
    if [ -f "${func_dir}requirements.txt" ]; then
        echo "  Installing deps for $(basename $func_dir)..."
        pip install -r "${func_dir}requirements.txt"
    fi
done

# 4. Instalar dependencias de desarrollo
echo "[4/7] Installing development dependencies..."
if [ -f "requirements-dev.txt" ]; then
    pip install -r requirements-dev.txt
fi

# 5. Instalar dependencias del frontend
echo "[5/7] Installing frontend dependencies..."
if [ -d "src/frontend" ] && [ -f "src/frontend/package.json" ]; then
    cd src/frontend
    npm install
    cd ../..
fi

# 6. Instalar Azure Functions Core Tools y Claude Code
echo "[6/7] Installing global npm packages..."
npm install -g azure-functions-core-tools@4 --unsafe-perm true 2>/dev/null || true
npm install -g @anthropic-ai/claude-code 2>/dev/null || true

# 7. Crear directorios necesarios
echo "[7/7] Creating necessary directories..."
mkdir -p logs
mkdir -p .devcontainer/scripts
chmod +x tools/*.sh 2>/dev/null || true
chmod +x .devcontainer/scripts/*.sh 2>/dev/null || true

echo ""
echo "=============================================="
echo "  Post-Create Setup Complete!"
echo "=============================================="
