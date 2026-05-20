"use strict";

const { BadRequestError } = require("./errors");

async function listTables(pool, schemaName = "public") {
  const result = await pool.query(
    `
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `,
    [schemaName],
  );

  return result.rows.map((row) => row.tableName);
}

async function listColumns(pool, tableName, schemaName = "public") {
  const result = await pool.query(
    `
      SELECT column_name AS "columnName", data_type AS "dataType"
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schemaName, tableName],
  );

  return result.rows;
}

async function getTableWhitelist(pool, tableName, schemaName = "public") {
  const tables = await listTables(pool, schemaName);

  if (!tables.includes(tableName)) {
    throw new BadRequestError("Invalid tableName.");
  }

  const columns = await listColumns(pool, tableName, schemaName);
  const columnNames = columns.map((column) => column.columnName);

  return {
    schemaName,
    tableName,
    columns,
    columnNames,
  };
}

async function getDatabaseHealth(pool, schemaName = "public") {
  const databaseResult = await pool.query(`
    SELECT current_database() AS "databaseName", current_user AS "userName"
  `);
  const schemaResult = await pool.query(
    `
      SELECT schema_name AS "schemaName"
      FROM information_schema.schemata
      WHERE schema_name NOT LIKE 'pg_%'
        AND schema_name <> 'information_schema'
      ORDER BY schema_name
    `,
  );
  const tables = await listTables(pool, schemaName);

  return {
    ...databaseResult.rows[0],
    schemaName,
    availableSchemas: schemaResult.rows.map((row) => row.schemaName),
    tableCount: tables.length,
  };
}

module.exports = {
  listTables,
  listColumns,
  getTableWhitelist,
  getDatabaseHealth,
};
