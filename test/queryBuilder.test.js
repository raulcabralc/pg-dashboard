'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildReportQuery, quoteIdentifier } = require('../backend/src/queryBuilder');

test('quoteIdentifier escapes double quotes', () => {
  assert.equal(quoteIdentifier('weird"name'), '"weird""name"');
});

test('buildReportQuery creates parameterized filters', () => {
  const query = buildReportQuery({
    tableName: 'users',
    columnNames: ['id', 'email'],
    filters: [{ columnName: 'email', operator: 'contains', value: "a' OR 1=1" }],
    allowedColumnNames: ['id', 'email', 'createdAt'],
    limit: 20
  });

  assert.equal(query.text, 'SELECT "id", "email" FROM "users" WHERE "email"::text ILIKE $1 LIMIT $2');
  assert.deepEqual(query.values, ["%a' OR 1=1%", 20]);
});

test('buildReportQuery casts pattern filters to text', () => {
  const query = buildReportQuery({
    tableName: 'pets',
    columnNames: ['id'],
    filters: [
      { columnName: 'id', operator: 'startsWith', value: '10' },
      { columnName: 'id', operator: 'endsWith', value: '7' }
    ],
    allowedColumnNames: ['id'],
    limit: 50
  });

  assert.equal(query.text, 'SELECT "id" FROM "pets" WHERE "id"::text ILIKE $1 AND "id"::text ILIKE $2 LIMIT $3');
  assert.deepEqual(query.values, ['10%', '%7', 50]);
});

test('buildReportQuery qualifies table names with schemaName', () => {
  const query = buildReportQuery({
    schemaName: 'sales',
    tableName: 'orders',
    columnNames: ['id'],
    filters: [],
    allowedColumnNames: ['id'],
    limit: 10
  });

  assert.equal(query.text, 'SELECT "id" FROM "sales"."orders" LIMIT $1');
  assert.deepEqual(query.values, [10]);
});

test('buildReportQuery allows one extra row for hasMore detection', () => {
  const query = buildReportQuery({
    tableName: 'pets',
    columnNames: ['id'],
    filters: [],
    allowedColumnNames: ['id'],
    limit: 501
  });

  assert.equal(query.text, 'SELECT "id" FROM "pets" LIMIT $1');
  assert.deepEqual(query.values, [501]);
});

test('buildReportQuery rejects unknown selected columns', () => {
  assert.throws(
    () =>
      buildReportQuery({
        tableName: 'users',
        columnNames: ['password'],
        filters: [],
        allowedColumnNames: ['id', 'email']
      }),
    /Invalid columnNames/
  );
});

test('buildReportQuery rejects unknown filter operators', () => {
  assert.throws(
    () =>
      buildReportQuery({
        tableName: 'users',
        columnNames: ['id'],
        filters: [{ columnName: 'id', operator: 'rawSql', value: '1' }],
        allowedColumnNames: ['id']
      }),
    /Invalid filter operator/
  );
});

test('buildReportQuery rejects impossible operators for column types', () => {
  assert.throws(
    () =>
      buildReportQuery({
        tableName: 'pets',
        columnNames: ['observacoes'],
        filters: [{ columnName: 'observacoes', operator: 'greaterThan', value: 'a' }],
        allowedColumnNames: ['observacoes'],
        allowedColumnTypes: { observacoes: 'text' }
      }),
    /not valid/
  );
});

test('buildReportQuery rejects empty and invalid typed filter values', () => {
  assert.throws(
    () =>
      buildReportQuery({
        tableName: 'pets',
        columnNames: ['idade'],
        filters: [{ columnName: 'idade', operator: 'equals', value: '' }],
        allowedColumnNames: ['idade'],
        allowedColumnTypes: { idade: 'integer' }
      }),
    /required/
  );

  assert.throws(
    () =>
      buildReportQuery({
        tableName: 'pets',
        columnNames: ['idade'],
        filters: [{ columnName: 'idade', operator: 'equals', value: 'abc' }],
        allowedColumnNames: ['idade'],
        allowedColumnTypes: { idade: 'integer' }
      }),
    /numeric/
  );
});
