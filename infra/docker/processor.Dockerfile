# ============================================================================
# Dilux Database Backup - Processor Function App
# ============================================================================
# Docker image with database backup tools (mysqldump, pg_dump, sqlcmd)
# This is the most critical image as it performs the actual backups
# ============================================================================

FROM mcr.microsoft.com/azure-functions/python:4-python3.11

# Install database client and backup tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    # MySQL client and backup tools
    default-mysql-client \
    # PostgreSQL client and backup tools
    postgresql-client \
    # Dependencies for mssql-tools
    curl \
    gnupg2 \
    apt-transport-https \
    # Compression tools
    gzip \
    bzip2 \
    && rm -rf /var/lib/apt/lists/*

# Install Microsoft SQL Server tools
RUN curl -sSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && curl -sSL https://packages.microsoft.com/config/debian/11/prod.list | tee /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends mssql-tools18 unixodbc-dev \
    && rm -rf /var/lib/apt/lists/*

# Add mssql-tools to PATH
ENV PATH="$PATH:/opt/mssql-tools18/bin"

# Set working directory
ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

WORKDIR /home/site/wwwroot

# Copy requirements first (for better caching)
COPY src/functions/processor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared code
COPY src/shared ./shared

# Copy function app code
COPY src/functions/processor/function_app.py .
COPY src/functions/processor/host.json .

# Copy backup engines
COPY src/functions/processor/backup_engines ./backup_engines
