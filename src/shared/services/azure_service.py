"""
Azure Service - Query Azure Resource Manager for VNet integration status.

This service uses the Azure Management SDK to query the VNet integration
status of Function Apps in real-time using Managed Identity.
"""

import os
import logging
from typing import Optional
from dataclasses import dataclass, field

from azure.identity import DefaultAzureCredential
from azure.mgmt.web import WebSiteManagementClient

logger = logging.getLogger(__name__)


@dataclass
class FunctionAppVNetInfo:
    """VNet integration info for a single Function App."""
    function_app_name: str
    function_app_type: str  # api, scheduler, processor
    vnet_name: Optional[str] = None
    subnet_name: Optional[str] = None
    vnet_resource_group: Optional[str] = None
    is_connected: bool = False
    error: Optional[str] = None


@dataclass
class VNetGroup:
    """Group of Function Apps connected to the same VNet."""
    vnet_name: str
    vnet_resource_group: str
    subnet_name: str
    connected_apps: list[str] = field(default_factory=list)
    total_expected: int = 3  # api, scheduler, processor

    @property
    def is_complete(self) -> bool:
        """All 3 Function Apps are connected to this VNet."""
        return len(self.connected_apps) == self.total_expected

    @property
    def connection_status(self) -> str:
        """Return status string like '3/3' or '2/3'."""
        return f"{len(self.connected_apps)}/{self.total_expected}"


@dataclass
class VNetStatusResponse:
    """Complete VNet status response."""
    has_vnet_integration: bool = False
    vnets: list[VNetGroup] = field(default_factory=list)
    function_apps: list[FunctionAppVNetInfo] = field(default_factory=list)
    inconsistencies: list[str] = field(default_factory=list)
    query_error: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON response."""
        return {
            "has_vnet_integration": self.has_vnet_integration,
            "vnets": [
                {
                    "vnet_name": v.vnet_name,
                    "vnet_resource_group": v.vnet_resource_group,
                    "subnet_name": v.subnet_name,
                    "connected_apps": v.connected_apps,
                    "connection_status": v.connection_status,
                    "is_complete": v.is_complete,
                }
                for v in self.vnets
            ],
            "function_apps": [
                {
                    "name": fa.function_app_name,
                    "type": fa.function_app_type,
                    "vnet_name": fa.vnet_name,
                    "subnet_name": fa.subnet_name,
                    "vnet_resource_group": fa.vnet_resource_group,
                    "is_connected": fa.is_connected,
                    "error": fa.error,
                }
                for fa in self.function_apps
            ],
            "inconsistencies": self.inconsistencies,
            "query_error": self.query_error,
        }


class AzureService:
    """Service for querying Azure Resource Manager."""

    def __init__(self):
        self._credential = None
        self._web_client = None
        self._subscription_id = os.environ.get("AZURE_SUBSCRIPTION_ID")
        self._resource_group = os.environ.get("DILUX_RESOURCE_GROUP")

        # Function App names from environment
        self._api_app_name = os.environ.get("DILUX_API_APP_NAME")
        self._scheduler_app_name = os.environ.get("DILUX_SCHEDULER_APP_NAME")
        self._processor_app_name = os.environ.get("DILUX_PROCESSOR_APP_NAME")

    @property
    def credential(self) -> DefaultAzureCredential:
        """Lazy initialization of Azure credential."""
        if self._credential is None:
            self._credential = DefaultAzureCredential()
        return self._credential

    @property
    def web_client(self) -> Optional[WebSiteManagementClient]:
        """Lazy initialization of Web Management client."""
        if self._web_client is None and self._subscription_id:
            self._web_client = WebSiteManagementClient(
                credential=self.credential,
                subscription_id=self._subscription_id
            )
        return self._web_client

    def _get_function_app_vnet_info(
        self,
        app_name: str,
        app_type: str,
        resource_group: str
    ) -> FunctionAppVNetInfo:
        """Get VNet integration info for a single Function App."""
        info = FunctionAppVNetInfo(
            function_app_name=app_name,
            function_app_type=app_type
        )

        if not self.web_client:
            info.error = "Azure client not initialized"
            return info

        try:
            # Get VNet connections for the app
            vnet_connections = list(
                self.web_client.web_apps.list_vnet_connections(
                    resource_group_name=resource_group,
                    name=app_name
                )
            )

            if vnet_connections:
                # Take the first connection (usually there's only one)
                conn = vnet_connections[0]

                # Parse VNet resource ID
                # Format: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Network/virtualNetworks/{vnet}/subnets/{subnet}
                if conn.vnet_resource_id:
                    parts = conn.vnet_resource_id.split("/")

                    # Find indices
                    try:
                        rg_idx = parts.index("resourceGroups") + 1
                        vnet_idx = parts.index("virtualNetworks") + 1
                        subnet_idx = parts.index("subnets") + 1

                        info.vnet_resource_group = parts[rg_idx]
                        info.vnet_name = parts[vnet_idx]
                        info.subnet_name = parts[subnet_idx]
                        info.is_connected = True
                    except (ValueError, IndexError) as e:
                        logger.warning(f"Failed to parse VNet resource ID: {conn.vnet_resource_id}, error: {e}")
                        info.error = f"Invalid VNet resource ID format"

        except Exception as e:
            logger.error(f"Error querying VNet info for {app_name}: {e}")
            info.error = str(e)

        return info

    def get_vnet_status(self) -> VNetStatusResponse:
        """
        Get VNet integration status for all 3 Function Apps.

        Returns structured response with:
        - List of VNets with connected apps
        - Per-app connection status
        - Inconsistencies (e.g., only 2/3 apps connected)
        """
        response = VNetStatusResponse()

        # Check prerequisites
        if not self._subscription_id:
            response.query_error = "AZURE_SUBSCRIPTION_ID not configured"
            return response

        if not self._resource_group:
            response.query_error = "DILUX_RESOURCE_GROUP not configured"
            return response

        if not self.web_client:
            response.query_error = "Failed to initialize Azure client"
            return response

        # Define apps to check
        apps_to_check = [
            (self._api_app_name, "api"),
            (self._scheduler_app_name, "scheduler"),
            (self._processor_app_name, "processor"),
        ]

        # Filter out apps without names configured
        apps_to_check = [(name, app_type) for name, app_type in apps_to_check if name]

        if not apps_to_check:
            response.query_error = "No Function App names configured (DILUX_*_APP_NAME)"
            return response

        # Query each Function App
        vnet_groups: dict[str, VNetGroup] = {}

        for app_name, app_type in apps_to_check:
            info = self._get_function_app_vnet_info(
                app_name,
                app_type,
                self._resource_group
            )
            response.function_apps.append(info)

            if info.is_connected and info.vnet_name:
                response.has_vnet_integration = True

                # Group by VNet
                vnet_key = f"{info.vnet_resource_group}/{info.vnet_name}"
                if vnet_key not in vnet_groups:
                    vnet_groups[vnet_key] = VNetGroup(
                        vnet_name=info.vnet_name,
                        vnet_resource_group=info.vnet_resource_group,
                        subnet_name=info.subnet_name,
                    )
                vnet_groups[vnet_key].connected_apps.append(app_type)

        # Convert to list
        response.vnets = list(vnet_groups.values())

        # Check for inconsistencies
        if response.has_vnet_integration:
            for vnet in response.vnets:
                if not vnet.is_complete:
                    missing = set(["api", "scheduler", "processor"]) - set(vnet.connected_apps)
                    response.inconsistencies.append(
                        f"VNet '{vnet.vnet_name}' has only {vnet.connection_status} apps connected. "
                        f"Missing: {', '.join(missing)}"
                    )

            # Check if apps are connected to different VNets
            if len(response.vnets) > 1:
                response.inconsistencies.append(
                    f"Function Apps are connected to {len(response.vnets)} different VNets. "
                    "All apps should typically be in the same VNet."
                )

        return response


# Singleton instance
_azure_service: Optional[AzureService] = None


def get_azure_service() -> AzureService:
    """Get or create the Azure service singleton."""
    global _azure_service
    if _azure_service is None:
        _azure_service = AzureService()
    return _azure_service
