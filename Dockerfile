FROM mcr.microsoft.com/devcontainers/base:ubuntu-20.04

ENV DEBIAN_FRONTEND=noninteractive

# 1. LIMPIAR TODOS LOS REPOS VIEJOS DE MICROSOFT QUE VIENEN PREINSTALADOS EN CODESPACES
RUN rm -f /etc/apt/sources.list.d/*microsoft*.list \
    && rm -f /etc/apt/sources.list.d/*azure*.list \
    && rm -f /etc/apt/trusted.gpg.d/*microsoft*.gpg \
    && rm -f /usr/share/keyrings/*microsoft*.gpg

# 2. INSTALAR DEPENDENCIAS BASE
RUN apt-get update && apt-get install -y \
    curl \
    gnupg2 \
    ca-certificates \
    apt-transport-https \
    software-properties-common \
    lsb-release \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# 3. IMPORTAR KEYRING OFICIAL DE MICROSOFT
RUN curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft.gpg

# 4. AZURE CLI PARA UBUNTU 20.04
RUN echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/azure-cli focal main" \
    > /etc/apt/sources.list.d/azure-cli.list \
    && apt-get update \
    && apt-get install -y azure-cli \
    && rm -rf /var/lib/apt/lists/*

# 5. MSSQL TOOLS (sqlcmd, bcp)
RUN echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/ubuntu/20.04/prod focal main" \
    > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y mssql-tools18 unixodbc-dev \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="$PATH:/opt/mssql-tools18/bin"

# 7. CLIENTES DE BASES DE DATOS
RUN apt-get update && apt-get install -y \
    mysql-client \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspaces

USER vscode
