import { createServer } from "node:http";
import next from "next";

export async function startNextServer({ port = 3000, hostname = "127.0.0.1" } = {}) {
  const app = next({ dev: true, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = createServer((request, response) => {
    handle(request, response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    url: `http://${hostname}:${actualPort}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      if (typeof app.close === "function") {
        await app.close();
      }
    }
  };
}
