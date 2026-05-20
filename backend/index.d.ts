import type { Router } from "express";
import type { Pool, PoolConfig } from "pg";

export interface PgDashboardConfig {
  connectionString?: string;
  pool?: Pool;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: PoolConfig["ssl"];
  schemaName?: string;
  enableCrud?: boolean;
  frontendDistPath?: string;
  jsonLimit?: string;
}

export function pgDashboard(config?: PgDashboardConfig): Router;

export function createDashboardRouter(config?: PgDashboardConfig): Router;
