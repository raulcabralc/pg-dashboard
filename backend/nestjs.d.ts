import type { DynamicModule, MiddlewareConsumer } from "@nestjs/common";
import type { PgDashboardConfig } from "./index";

export interface PgDashboardNestModuleOptions extends PgDashboardConfig {
  route?: string;
}

export declare class PgDashboardModule {
  static register(options?: PgDashboardNestModuleOptions): DynamicModule;
  configure(consumer: MiddlewareConsumer): void;
}
