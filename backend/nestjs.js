"use strict";

const { pgDashboard } = require("./index");

function loadNestCommon() {
  try {
    return require("@nestjs/common");
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      throw new Error(
        "pg-dashboard/nestjs requires @nestjs/common. Install NestJS or use the Express export from pg-dashboard.",
      );
    }

    throw error;
  }
}

function normalizeOptions(options = {}) {
  const { route = "/admin/db", ...dashboardConfig } = options;

  return {
    route,
    dashboardConfig,
  };
}

const { Module } = loadNestCommon();

class PgDashboardModule {
  static register(options = {}) {
    const normalizedOptions = normalizeOptions(options);

    class RegisteredPgDashboardModule {
      configure(consumer) {
        consumer
          .apply(pgDashboard(normalizedOptions.dashboardConfig))
          .forRoutes(normalizedOptions.route);
      }
    }

    Module({})(RegisteredPgDashboardModule);

    return {
      module: RegisteredPgDashboardModule,
    };
  }

  configure(consumer) {
    const { route, dashboardConfig } = normalizeOptions();

    consumer.apply(pgDashboard(dashboardConfig)).forRoutes(route);
  }
}

Module({})(PgDashboardModule);

module.exports = {
  PgDashboardModule,
};
