"use strict";

const { BadRequestError } = require("./errors");

const allowedOperators = new Map([
  ["equals", "="],
  ["notEquals", "<>"],
  ["contains", "ILIKE"],
  ["startsWith", "ILIKE"],
  ["endsWith", "ILIKE"],
  ["greaterThan", ">"],
  ["greaterThanOrEqual", ">="],
  ["lessThan", "<"],
  ["lessThanOrEqual", "<="],
  ["isNull", "IS NULL"],
  ["isNotNull", "IS NOT NULL"],
]);

const textTypes = new Set(["character", "character varying", "text", "uuid"]);
const numberTypes = new Set([
  "bigint",
  "double precision",
  "integer",
  "numeric",
  "real",
  "smallint",
]);
const dateTypes = new Set([
  "date",
  "time without time zone",
  "time with time zone",
  "timestamp without time zone",
  "timestamp with time zone",
]);

function getFilterKind(dataType) {
  if (numberTypes.has(dataType)) {
    return "number";
  }

  if (dateTypes.has(dataType)) {
    return "date";
  }

  if (dataType === "boolean") {
    return "boolean";
  }

  if (textTypes.has(dataType)) {
    return "text";
  }

  return "basic";
}

function getAllowedOperatorsForKind(kind) {
  if (kind === "text") {
    return new Set([
      "equals",
      "notEquals",
      "contains",
      "startsWith",
      "endsWith",
      "isNull",
      "isNotNull",
    ]);
  }

  if (kind === "number" || kind === "date") {
    return new Set([
      "equals",
      "notEquals",
      "greaterThan",
      "greaterThanOrEqual",
      "lessThan",
      "lessThanOrEqual",
      "isNull",
      "isNotNull",
    ]);
  }

  if (kind === "boolean") {
    return new Set(["equals", "notEquals", "isNull", "isNotNull"]);
  }

  return new Set(["equals", "notEquals", "isNull", "isNotNull"]);
}

function assertFilterValueMatchesType(filter, dataType) {
  if (filter.operator === "isNull" || filter.operator === "isNotNull") {
    return;
  }

  if (filter.value === undefined || filter.value === null || filter.value === "") {
    throw new BadRequestError(`Filter value is required for ${filter.columnName}.`);
  }

  const kind = getFilterKind(dataType);
  const textValue = String(filter.value);

  if (kind === "number" && !/^-?\d+(\.\d+)?$/.test(textValue)) {
    throw new BadRequestError(`Filter value for ${filter.columnName} must be numeric.`);
  }

  if (kind === "boolean" && !/^(true|false)$/i.test(textValue)) {
    throw new BadRequestError(`Filter value for ${filter.columnName} must be true or false.`);
  }

  if (kind === "date" && Number.isNaN(Date.parse(textValue))) {
    throw new BadRequestError(`Filter value for ${filter.columnName} must be a valid date or time.`);
  }
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteQualifiedTableName(tableName, schemaName) {
  if (!schemaName) {
    return quoteIdentifier(tableName);
  }

  return `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
}

function assertColumnsExist(columnNames, allowedColumnNames, fieldName) {
  const invalidColumnNames = columnNames.filter(
    (columnName) => !allowedColumnNames.includes(columnName),
  );

  if (invalidColumnNames.length > 0) {
    throw new BadRequestError(
      `Invalid ${fieldName}: ${invalidColumnNames.join(", ")}.`,
    );
  }
}

function normalizeColumnNames(columnNames, allowedColumnNames) {
  if (columnNames === undefined || columnNames === null) {
    return allowedColumnNames;
  }

  if (!Array.isArray(columnNames) || columnNames.length === 0) {
    throw new BadRequestError("columnNames must be a non-empty array.");
  }

  const uniqueColumnNames = [...new Set(columnNames)];
  assertColumnsExist(uniqueColumnNames, allowedColumnNames, "columnNames");

  return uniqueColumnNames;
}

function normalizeFilters(filters, allowedColumnNames, allowedColumnTypes = {}) {
  if (filters === undefined || filters === null) {
    return [];
  }

  if (!Array.isArray(filters)) {
    throw new BadRequestError("filters must be an array.");
  }

  return filters.map((filter) => {
    if (!filter || typeof filter !== "object") {
      throw new BadRequestError("Each filter must be an object.");
    }

    const { columnName, operator = "equals", value } = filter;

    if (!allowedColumnNames.includes(columnName)) {
      throw new BadRequestError(`Invalid filter columnName: ${columnName}.`);
    }

    if (!allowedOperators.has(operator)) {
      throw new BadRequestError(`Invalid filter operator: ${operator}.`);
    }

    const dataType = allowedColumnTypes[columnName];

    if (dataType) {
      const kind = getFilterKind(dataType);
      const allowedOperatorsForKind = getAllowedOperatorsForKind(kind);

      if (!allowedOperatorsForKind.has(operator)) {
        throw new BadRequestError(`Operator ${operator} is not valid for ${columnName}.`);
      }

      assertFilterValueMatchesType({ columnName, operator, value }, dataType);
    }

    return {
      columnName,
      operator,
      value,
    };
  });
}

function buildFilterValue(operator, value) {
  if (operator === "contains") {
    return `%${value}%`;
  }

  if (operator === "startsWith") {
    return `${value}%`;
  }

  if (operator === "endsWith") {
    return `%${value}`;
  }

  return value;
}

function buildFilterColumnExpression(columnName, operator) {
  const quotedColumnName = quoteIdentifier(columnName);

  if (operator === "contains" || operator === "startsWith" || operator === "endsWith") {
    return `${quotedColumnName}::text`;
  }

  return quotedColumnName;
}

function buildReportQuery({
  schemaName,
  tableName,
  columnNames,
  filters,
  allowedColumnNames,
  allowedColumnTypes,
  limit = 100,
}) {
  const selectedColumnNames = normalizeColumnNames(
    columnNames,
    allowedColumnNames,
  );
  const normalizedFilters = normalizeFilters(
    filters,
    allowedColumnNames,
    allowedColumnTypes,
  );
  const safeLimit = Number.parseInt(limit, 10);

  if (!Number.isInteger(safeLimit) || safeLimit < 1 || safeLimit > 501) {
    throw new BadRequestError("limit must be an integer between 1 and 501.");
  }

  const values = [];
  const whereClauses = [];

  for (const filter of normalizedFilters) {
    const sqlOperator = allowedOperators.get(filter.operator);
    const columnExpression = buildFilterColumnExpression(
      filter.columnName,
      filter.operator,
    );

    if (filter.operator === "isNull" || filter.operator === "isNotNull") {
      whereClauses.push(`${columnExpression} ${sqlOperator}`);
      continue;
    }

    values.push(buildFilterValue(filter.operator, filter.value));
    whereClauses.push(`${columnExpression} ${sqlOperator} $${values.length}`);
  }

  values.push(safeLimit);

  const selectClause = selectedColumnNames.map(quoteIdentifier).join(", ");
  const whereClause =
    whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";
  const text = `SELECT ${selectClause} FROM ${quoteQualifiedTableName(tableName, schemaName)}${whereClause} LIMIT $${values.length}`;

  return {
    text,
    values,
  };
}

module.exports = {
  allowedOperators,
  buildFilterColumnExpression,
  getAllowedOperatorsForKind,
  getFilterKind,
  quoteIdentifier,
  quoteQualifiedTableName,
  buildReportQuery,
};
