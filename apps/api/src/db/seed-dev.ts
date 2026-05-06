import { sql } from "./client.js";
import { ensureDevUser } from "../modules/dev/dev-user.repository.js";

await ensureDevUser();
await sql.end();

console.log("Seeded dev user");
