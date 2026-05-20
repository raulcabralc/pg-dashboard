"use strict";

const path = require("path");
const express = require("express");
const { Pool } = require("pg");
const { BadRequestError } = require("./errors");
const {
  buildDeleteQuery,
  buildFindRecordQuery,
  buildInsertQuery,
  buildReportQuery,
  buildUpdateQuery,
} = require("./queryBuilder");
const {
  getCrudMetadata,
  getDatabaseHealth,
  getTableWhitelist,
  listColumns,
  listColumnValues,
  listRelations,
} = require("./metadata");

function normalizeReportLimit(limit) {
  const reportLimit = Number.parseInt(limit || 100, 10);

  if (!Number.isInteger(reportLimit) || reportLimit < 1 || reportLimit > 500) {
    throw new BadRequestError("limit must be an integer between 1 and 500.");
  }

  return reportLimit;
}

function assertCrudAllowed(crudMetadata, action) {
  const flagName = `can${action[0].toUpperCase()}${action.slice(1)}`;

  if (!crudMetadata[flagName]) {
    throw new BadRequestError(`${action} is not available for this relation.`);
  }
}

function assertEnumValues(crudMetadata, values = {}) {
  for (const column of crudMetadata.columns) {
    if (!column.isEnum || values[column.columnName] === undefined) {
      continue;
    }

    const value = values[column.columnName];

    if (value === null || value === "") {
      continue;
    }

    if (!column.enumValues.includes(value)) {
      throw new BadRequestError(
        `${column.columnName} must be one of: ${column.enumValues.join(", ")}.`,
      );
    }
  }
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
      const relations = await listRelations(pool, schemaName);
      const tables = relations.map((relation) => relation.tableName);
      res.json({ schemaName, tables, relations });
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

  router.get("/api/tables/:tableName/crud-meta", async (req, res, next) => {
    try {
      const crudMetadata = await getCrudMetadata(
        pool,
        req.params.tableName,
        schemaName,
      );
      res.json(crudMetadata);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/api/tables/:tableName/columns/:columnName/values",
    async (req, res, next) => {
      try {
        const result = await listColumnValues(
          pool,
          req.params.tableName,
          req.params.columnName,
          schemaName,
          50,
        );
        res.json({
          tableName: req.params.tableName,
          columnName: req.params.columnName,
          values: result.values,
          hasMore: result.hasMore,
          useDropdown: !result.hasMore,
        });
      } catch (error) {
        next(error);
      }
    },
  );

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

  router.post("/api/tables/:tableName/records", async (req, res, next) => {
    try {
      const crudMetadata = await getCrudMetadata(
        pool,
        req.params.tableName,
        schemaName,
      );
      assertCrudAllowed(crudMetadata, "create");
      assertEnumValues(crudMetadata, req.body?.values);
      const query = buildInsertQuery({
        schemaName,
        tableName: req.params.tableName,
        values: req.body?.values,
        writableColumnNames: crudMetadata.columns
          .filter((column) => column.isWritable)
          .map((column) => column.columnName),
        returningColumnNames: crudMetadata.columns.map((column) => column.columnName),
      });
      const result = await pool.query(query.text, query.values);

      res.status(201).json({ row: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/tables/:tableName/records/find", async (req, res, next) => {
    try {
      const crudMetadata = await getCrudMetadata(
        pool,
        req.params.tableName,
        schemaName,
      );

      if (!crudMetadata.primaryKeyColumns.length) {
        throw new BadRequestError("Primary key is required to find a record.");
      }

      const query = buildFindRecordQuery({
        schemaName,
        tableName: req.params.tableName,
        primaryKey: req.body?.primaryKey,
        primaryKeyColumnNames: crudMetadata.primaryKeyColumns,
        returningColumnNames: crudMetadata.columns.map((column) => column.columnName),
      });
      const result = await pool.query(query.text, query.values);

      if (!result.rows[0]) {
        throw new BadRequestError("Record not found.");
      }

      res.json({ row: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/api/tables/:tableName/records", async (req, res, next) => {
    try {
      const crudMetadata = await getCrudMetadata(
        pool,
        req.params.tableName,
        schemaName,
      );
      assertCrudAllowed(crudMetadata, "update");
      assertEnumValues(crudMetadata, req.body?.values);
      const query = buildUpdateQuery({
        schemaName,
        tableName: req.params.tableName,
        primaryKey: req.body?.primaryKey,
        values: req.body?.values,
        writableColumnNames: crudMetadata.columns
          .filter((column) => column.isWritable)
          .map((column) => column.columnName),
        primaryKeyColumnNames: crudMetadata.primaryKeyColumns,
        returningColumnNames: crudMetadata.columns.map((column) => column.columnName),
      });
      const result = await pool.query(query.text, query.values);

      if (!result.rows[0]) {
        throw new BadRequestError("Record not found.");
      }

      res.json({ row: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/api/tables/:tableName/records", async (req, res, next) => {
    try {
      const crudMetadata = await getCrudMetadata(
        pool,
        req.params.tableName,
        schemaName,
      );
      assertCrudAllowed(crudMetadata, "delete");
      const query = buildDeleteQuery({
        schemaName,
        tableName: req.params.tableName,
        primaryKey: req.body?.primaryKey,
        primaryKeyColumnNames: crudMetadata.primaryKeyColumns,
        returningColumnNames: crudMetadata.columns.map((column) => column.columnName),
      });
      const result = await pool.query(query.text, query.values);

      if (!result.rows[0]) {
        throw new BadRequestError("Record not found.");
      }

      res.json({ row: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });

  router.use("/api", (req, res) => {
    res.status(404).json({
      error: {
        message: "API route not found.",
      },
    });
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
