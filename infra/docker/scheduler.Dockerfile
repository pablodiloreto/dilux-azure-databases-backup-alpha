# ============================================================================
# Dilux Database Backup - Scheduler Function App
# ============================================================================
# Docker image for timer-triggered backup scheduling
# ============================================================================

FROM mcr.microsoft.com/azure-functions/python:4-python3.11

# Install database client tools (needed for discovery operations)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # MySQL client
    default-mysql-client \
    # PostgreSQL client
    postgresql-client \
    # Dependencies for mssql-tools
    curl \
    gnupg2 \
    apt-transport-https \
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
COPY src/functions/scheduler/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared code
COPY src/shared ./shared

# Copy function app code
COPY src/functions/scheduler/function_app.py .
COPY src/functions/scheduler/host.json .
