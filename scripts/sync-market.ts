import "dotenv/config";
import { syncMarketData } from "../src/lib/market-service";

async function main() {
  console.log("Syncing Vietnam market data from Entrade + Yahoo...");
  const result = await syncMarketData(true);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
