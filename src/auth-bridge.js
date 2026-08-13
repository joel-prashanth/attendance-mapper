import http from "http";

const HOST = "127.0.0.1";

const PORT = 3847;

let currentSession = null;

// =====================================================
// CORS
// =====================================================

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// =====================================================
// READ JSON
// =====================================================

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();

      if (body.length > 1024 * 1024) {
        reject(new Error("Request too large."));

        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });

    req.on("error", reject);
  });
}

// =====================================================
// START AUTH BRIDGE
// =====================================================

export function startAuthBridge() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      setCorsHeaders(res);

      // OPTIONS
      if (req.method === "OPTIONS") {
        res.writeHead(204);

        res.end();

        return;
      }

      // HEALTH
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, {
          "Content-Type": "application/json",
        });

        res.end(
          JSON.stringify({
            success: true,
          }),
        );

        return;
      }

      // CONNECT
      if (req.method === "POST" && req.url === "/connect") {
        try {
          const body = await readJsonBody(req);

          if (!body.cookie) {
            throw new Error("ERP cookie missing.");
          }

          currentSession = {
            cookie: body.cookie,

            facultyName: body.facultyName ?? null,

            receivedAt: new Date().toISOString(),
          };

          console.log("\n✅ Aurora browser session detected.");

          if (currentSession.facultyName) {
            console.log(`Faculty: ${currentSession.facultyName}`);
          }

          res.writeHead(200, {
            "Content-Type": "application/json",
          });

          res.end(
            JSON.stringify({
              success: true,
            }),
          );
        } catch (error) {
          res.writeHead(400, {
            "Content-Type": "application/json",
          });

          res.end(
            JSON.stringify({
              success: false,

              message: error.message,
            }),
          );
        }

        return;
      }

      res.writeHead(404, {
        "Content-Type": "application/json",
      });

      res.end(
        JSON.stringify({
          success: false,

          message: "Not found.",
        }),
      );
    });

    server.once("error", reject);

    server.listen(PORT, HOST, () => {
      resolve(server);
    });
  });
}

// =====================================================
// WAIT FOR BROWSER SESSION
// =====================================================

export async function waitForBrowserSession({ timeoutMs = 120000 } = {}) {
  if (currentSession?.cookie) {
    return currentSession;
  }

  console.log("\nWaiting for Aurora browser login...");

  console.log("Open Chrome → Aurora ERP → Aurora Attendance Connector.");

  return new Promise((resolve, reject) => {
    const started = Date.now();

    const interval = setInterval(() => {
      if (currentSession?.cookie) {
        clearInterval(interval);

        resolve(currentSession);

        return;
      }

      if (Date.now() - started > timeoutMs) {
        clearInterval(interval);

        reject(new Error("Timed out waiting for Aurora browser session."));
      }
    }, 300);
  });
}

// =====================================================
// GET CURRENT SESSION
// =====================================================

export function getBrowserSession() {
  return currentSession;
}
