"use strict";

const path = require("path");
const express = require("express");
const { Pool } = require("pg");
const { BadRequestError } = require("./errors");
const { buildReportQuery } = require("./queryBuilder");
const {
  getDatabaseHealth,
  getTableWhitelist,
  listColumns,
  listTables,
} = require("./metadata");

function normalizeReportLimit(limit) {
  const reportLimit = Number.parseInt(limit || 100, 10);

  if (!Number.isInteger(reportLimit) || reportLimit < 1 || reportLimit > 500) {
    throw new BadRequestError("limit must be an integer between 1 and 500.");
  }

  return reportLimit;
}

/**
 * @param {import('../index').PgDashboardConfig} config
 */
function createPool(config) {
  if (config.pool) {
    return config.pool;
  }

  return new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections || 5,
    idleTimeoutMillis: config.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
    ssl: config.ssl,
  });
}

/**
 * @param {import('../index').PgDashboardConfig} [config]
 * @returns {import('express').Router}
 */
function createDashboardRouter(config = {}) {
  const router = express.Router();
  const pool = createPool(config);
  const schemaName = config.schemaName || "public";
  const frontendDistPath =
    config.frontendDistPath || path.resolve(__dirname, "../../frontend/dist");
  const indexPath = path.join(frontendDistPath, "index.html");

  router.use(express.json({ limit: config.jsonLimit || "100kb" }));

  router.get("/api/health", async (req, res, next) => {
    try {
      const health = await getDatabaseHealth(pool, schemaName);
      res.json(health);
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/tables", async (req, res, next) => {
    try {
      const tables = await listTables(pool, schemaName);
      res.json({ schemaName, tables });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/tables/:tableName/columns", async (req, res, next) => {
    try {
      await getTableWhitelist(pool, req.params.tableName, schemaName);
      const columns = await listColumns(pool, req.params.tableName, schemaName);
      res.json({ schemaName, tableName: req.params.tableName, columns });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/reports/generate", async (req, res, next) => {
    try {
      const { tableName, columnNames, filters, limit } = req.body || {};
      const reportLimit = normalizeReportLimit(limit);
      const whitelist = await getTableWhitelist(pool, tableName, schemaName);
      const query = buildReportQuery({
        schemaName,
        tableName,
        columnNames,
        filters,
        limit: reportLimit + 1,
        allowedColumnNames: whitelist.columnNames,
        allowedColumnTypes: Object.fromEntries(
          whitelist.columns.map((column) => [column.columnName, column.dataType]),
        ),
      });
      const result = await pool.query(query.text, query.values);
      const hasMore = result.rows.length > reportLimit;

      res.json({
        rows: result.rows.slice(0, reportLimit),
        rowCount: Math.min(result.rowCount, reportLimit),
        limit: reportLimit,
        hasMore,
      });
    } catch (error) {
      next(error);
    }
  });

  router.use(express.static(frontendDistPath));

  router.get("*", (req, res) => {
    res.sendFile(indexPath);
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: {
        message: statusCode === 500 ? "Internal server error." : error.message,
      },
    });
  });

  return router;
}

module.exports = {
  createDashboardRouter,
};
