import { startNextServer } from "./next-server.mjs";

let shuttingDown = false;
const server = await startNextServer({ port: Number(process.env.PORT || 3000) });

console.log(`E2E Next server ready at ${server.url}`);

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  await server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
