// Minimal Node declarations for tests that read real files. @types/node is intentionally not a dependency.
declare module 'node:fs' {
  export interface Dirent { name: string; isFile(): boolean; isDirectory(): boolean }
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readFileSync(path: string): Uint8Array;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function statSync(path: string): { size: number };
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare const process: { cwd(): string };
