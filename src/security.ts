import * as fs from 'fs';
import * as path from 'path';

/**
 * 简单的安全工具：对 id 做白名单字符化，和确保相对路径在 base 目录下。
 */
export function sanitizeId(id: string): string {
  return (id || '').toString().replace(/[^A-Za-z0-9_\-]/g, '_');
}

export function ensureSafePath(base: string, relativePath: string): string {
  const baseResolved = path.resolve(base);
  const resolved = path.resolve(base, relativePath);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    throw new Error(`Unsafe path detected: ${resolved} is not within ${baseResolved}`);
  }
  return resolved;
}

export async function safeWriteFile(base: string, relativePath: string, data: string): Promise<void> {
  const full = ensureSafePath(base, relativePath);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, data, 'utf8');
}

export async function safeAppendFile(base: string, relativePath: string, data: string): Promise<void> {
  const full = ensureSafePath(base, relativePath);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.appendFile(full, data, 'utf8');
}

export function ensureWithinBase(base: string, target: string): boolean {
  const baseResolved = path.resolve(base);
  const resolved = path.resolve(target);
  return resolved === baseResolved || resolved.startsWith(baseResolved + path.sep);
}
