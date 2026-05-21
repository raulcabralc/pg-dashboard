# PG Interactive Dashboard

Plug-and-play PostgreSQL dashboard middleware for Express.

PG Interactive Dashboard maps a PostgreSQL database at runtime and serves a small React interface for querying tables, views, materialized views, CRUD operations, exports, and stored function execution.

It is designed to be mounted like Swagger UI:

```js
app.use("/admin/db", pgDashboard({ connectionString: process.env.DATABASE_URL }));
```

## Features

- Dynamic metadata from PostgreSQL system catalogs.
- Tables, views, and materialized views listed automatically.
- Safe report/query builder with whitelisted table and column names.
- Parameterized filters using native `pg` placeholders.
- Generic CRUD UI for relations with primary keys.
- Enum-aware forms and filters.
- Stored function explorer and executor.
- CSV and Excel export from returned rows.
- Isolated Express router with its own connection pool or a provided `pg` pool.
- Bundled React frontend served from the package.

## Installation

```bash
npm install pg-dashboard
```

You also need Express in your host app:

```bash
npm install express
```

## Usage

```js
const express = require("express");
const { pgDashboard } = require("pg-dashboard");

const app = express();

app.use(
  "/admin/db",
  pgDashboard({
    connectionString: process.env.DATABASE_URL,
    schemaName: "public",
    enableCrud: true,
    enableFunctions: true,
  }),
);

app.listen(3000, () => {
  console.log("App running at http://localhost:3000");
  console.log("Dashboard running at http://localhost:3000/admin/db");
});
```

Open `/admin/db` in the browser.

## Configuration

All configuration keys use camelCase.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `connectionString` | `string` | `undefined` | PostgreSQL connection string used to create an internal pool. |
| `pool` | `Pool` | `undefined` | Existing `pg` pool. If provided, it is used instead of creating a new pool. |
| `schemaName` | `string` | `"public"` | PostgreSQL schema to inspect. |
| `enableCrud` | `boolean` | `false` | Enables create, update, and delete actions in the UI when possible. |
| `enableFunctions` | `boolean` | `false` | Enables listing and executing stored functions. Functions may have side effects, so this is opt-in. |
| `maxConnections` | `number` | `5` | Max connections for the internal pool. |
| `idleTimeoutMillis` | `number` | `30000` | Idle timeout for the internal pool. |
| `connectionTimeoutMillis` | `number` | `5000` | Connection timeout for the internal pool. |
| `ssl` | `PoolConfig["ssl"]` | `undefined` | SSL config forwarded to `pg`. |
| `frontendDistPath` | `string` | bundled frontend | Custom path for the built frontend assets. Mostly useful for local development. |
| `jsonLimit` | `string` | `"100kb"` | Limit passed to `express.json()`. |

## Using An Existing Pool

```js
const { Pool } = require("pg");
const { pgDashboard } = require("pg-dashboard");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

app.use(
  "/admin/db",
  pgDashboard({
    pool,
    schemaName: "public",
    enableCrud: true,
    enableFunctions: true,
  }),
);
```

## Security Notes

Dynamic SQL is built with two layers of protection:

- Table, view, function, and column names are validated against PostgreSQL metadata before execution.
- User-provided values are passed through parameterized `pg` placeholders such as `$1`, `$2`, and `$3`.

Do not expose this dashboard publicly without your own authentication and authorization middleware:

```js
app.use("/admin/db", requireAdminUser, pgDashboard({ connectionString }));
```

For production, prefer a dedicated PostgreSQL user with the smallest useful permissions. Keep `enableCrud` and `enableFunctions` disabled unless the mounted dashboard is protected and the user is expected to mutate data or execute stored functions.

## Internal Route Order

The package router is intentionally ordered as:

1. `/api/*` routes.
2. `express.static()` for the bundled React `dist`.
3. `*` fallback returning `index.html` for the SPA.

This lets the dashboard work correctly when mounted under a nested Express path.

## Local Development

Install root and frontend dependencies:

```bash
npm install
npm --prefix frontend install
```

Build the frontend:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run the example server:

```bash
DATABASE_URL="postgres://postgres:password@localhost:5432/mydb" npm run example
```

Then open:

```text
http://localhost:3000/admin/db
```

## Publishing

Before publishing:

```bash
npm run pack:check
```

Then publish:

```bash
npm publish
```

The published package includes only:

- `backend`
- `frontend/dist`
- `README.md`
- `LICENSE`
