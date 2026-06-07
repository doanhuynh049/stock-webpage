import { readFileSync } from "node:fs";
import { join } from "node:path";

export type IndexStock = {
  symbol: string;
  name: string;
  sector: string;
};

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data", file), "utf-8")) as T;
}

export function getVN30Universe(): IndexStock[] {
  const data = loadJson<{ vn30_stocks: IndexStock[] }>("vn30-stock-info.json");
  return data.vn30_stocks ?? [];
}

export function getVN100Universe(): IndexStock[] {
  const data = loadJson<{ vn100_stocks: IndexStock[] }>("vn100-stock-info.json");
  return data.vn100_stocks ?? [];
}
