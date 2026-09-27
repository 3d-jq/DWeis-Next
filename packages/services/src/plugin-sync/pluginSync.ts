import type {
  PluginSyncArchiveExportResult,
  PluginSyncCandidateListResult,
  PluginSyncImportResult,
} from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

export interface IPluginSyncService {
  listLocalUserPluginCandidates(): Promise<PluginSyncCandidateListResult>;
  exportPluginsArchive(params: { pluginIds: string[] }): Promise<PluginSyncArchiveExportResult>;
  exportMarketplaceSourceArchive(params: {
    marketplaceId: string;
    pluginNames: string[];
    source: Record<string, unknown>;
  }): Promise<{
    archive: Uint8Array;
    archiveBytes: number;
    marketplaceId: string;
    pluginNames: string[];
  }>;
  importPluginsArchive(params: {
    archive: Uint8Array;
    overwrite?: false;
  }): Promise<PluginSyncImportResult>;
  importMarketplaceSourceArchive(params: { archive: Uint8Array; overwrite?: false }): Promise<{
    marketplaceId: string;
    path: string;
    status: "skipped" | "synced";
  }>;
}

export const IPluginSyncService = createServiceDescriptor<IPluginSyncService>(
  ServiceChannels.PluginSync,
);
