#!/bin/bash
set -e

echo "=============================================="
echo "  Dilux Database Backup - Post-Create Setup"
echo "=============================================="

# 1. Crear .env si no existe
if [ ! -f .env ]; then
    echo "[1/7] Creating .env from .env.example..."
    cp .env.example .env
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
        echo "  Installing deps for $(basename "$func_dir")..."
        pip install -r "${func_dir}requirements.txt"
    fi
done

# 4. Dependencias de desarrollo
echo "[4/7] Installing development dependencies..."
if [ -f "requirements-dev.txt" ]; then
    pip install -r requirements-dev.txt
fi

# 4.5 Arreglar permisos de cachés pip/npm (por si quedaron root-owned)
echo "[4.5/7] Fixing cache directory permissions..."
if command -v sudo >/dev/null 2>&1; then
    sudo mkdir -p /home/vscode/.npm /home/vscode/.cache/pip
    sudo chown -R vscode:vscode /home/vscode/.npm /home/vscode/.cache || true
fi

# 5. Instalar dependencias frontend
echo "[5/7] Installing frontend dependencies..."
if [ -d "src/frontend" ] && [ -f "src/frontend/package.json" ]; then
    cd src/frontend
    npm install
    cd ../..
fi

# 6. Instalar herramientas globales
echo "[6/7] Installing global npm packages..."

# Asegurar que el bin global de npm esté en el PATH (para 'claude', 'func', etc.)
GLOBAL_NPM_BIN="$(npm bin -g || echo "")"
if [ -n "$GLOBAL_NPM_BIN" ]; then
    if ! echo "$PATH" | grep -q "$GLOBAL_NPM_BIN"; then
        echo "export PATH=\"$GLOBAL_NPM_BIN:\$PATH\"" >> ~/.bashrc
    fi
fi

npm install -g azure-functions-core-tools@4 --unsafe-perm true || true
npm install -g @anthropic-ai/claude-code || true

# 7. Crear directorios necesarios
echo "[7/7] Creating necessary directories..."
mkdir -p logs
chmod +x tools/*.sh 2>/dev/null || true
chmod +x .devcontainer/scripts/*.sh 2>/dev/null || true

echo ""
echo "=============================================="
echo "  Post-Create Setup Complete!"
echo "=============================================="
