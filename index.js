import { CosmosClient } from "@azure/cosmos";
import 'dotenv/config';

// 1. 환경 변수에서 연결 정보 가져오기
const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY; 
const dbclient = new CosmosClient({ endpoint, key });

const { database } = await dbclient.databases.createIfNotExists({ id: "Test Database" });
const { container } = await database.containers.createIfNotExists({ id: "Test Container" });

// const cities = [
//   { id: "1", name: "Olympia", state: "WA", isCapitol: true },
//   { id: "2", name: "Redmond", state: "WA", isCapitol: false },
//   { id: "3", name: "Chicago", state: "IL", isCapitol: false },
// ];
// for (const city of cities) {
//   await container.items.create(city);
// }
const { resources } = await container.items
  .query("SELECT * from c WHERE c.isCapitol = true")
  .fetchAll();

console.log("-----------------------------------------");
console.log("結果 (isCapitol = true):");
console.log(resources);
console.log(`\n全部 ${resources.length}個の検索結果が出ました`);
console.log("-----------------------------------------");

