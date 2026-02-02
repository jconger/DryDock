declare module "better-sqlite3" {
  export type RunResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  export type Statement<T = unknown> = {
    run: (...params: unknown[]) => RunResult;
    get: (...params: unknown[]) => T;
    all: (...params: unknown[]) => T[];
  };

  export type Database = {
    exec: (sql: string) => void;
    pragma: (value: string) => void;
    prepare: <T = unknown>(sql: string) => Statement<T>;
  };

  type DatabaseConstructor = new (path?: string, options?: unknown) => Database;

  const Database: DatabaseConstructor;
  export default Database;
}
