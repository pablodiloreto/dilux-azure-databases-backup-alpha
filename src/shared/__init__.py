"""
Dilux Database Backup - Shared Package

This package contains shared code used across all Function Apps:
- API (HTTP triggers)
- Scheduler (Timer triggers)
- Processor (Queue triggers)

Modules:
- config: Configuration management and Azure clients
- models: Data models for databases, backups, etc.
- services: Azure Storage, Key Vault, notifications
- utils: Validators, formatters, helpers
- exceptions: Custom exceptions
"""

__version__ = "0.1.0"
__author__ = "Dilux Solutions"
