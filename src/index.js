require("dotenv").config();

const WebSocket = require("ws");
const mqtt = require("mqtt");
const { randomInt } = require("crypto");
const mongoose = require("mongoose");

// Configuration from environment variables
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/stock_t0";
const WSS_PORT = process.env.WSS_PORT || 8080;
const BROKER_HOST = process.env.BROKER_HOST || "datafeed-lts-krx.dnse.com.vn";
const BROKER_PORT = parseInt(process.env.BROKER_PORT || "443");
const CLIENT_ID_PREFIX = "dnse-price-json-mqtt-ws-sub-";
const DEBUG = process.env.DEBUG === "true";

// DNSE Auto-refresh credentials
const DNSE_USERNAME = process.env.DNSE_USERNAME;
const DNSE_PASSWORD = process.env.DNSE_PASSWORD;
const TARGET_USER_ID = process.env.TARGET_USER_ID || "";

// Store active MQTT clients by WebSocket connection
const mqttClients = new WeakMap();

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    console.log(`📍 Database: ${MONGODB_URI.split("@").pop()}`);
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Define Stock model
const stockSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  marketPrice: { type: Number, default: 0 },
  highPrice: { type: Number, default: 0 },
  lowPrice: { type: Number, default: 0 },
  openPrice: { type: Number, default: 0 },
  volumn: { type: Number, default: 0 },
  industry: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Stock = mongoose.models.Stock || mongoose.model("Stock", stockSchema);

// Define User model
const userSchema = new mongoose.Schema({
  email: String,
  investorToken: String,
  investorId: String,
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

/**
 * Auto-refresh DNSE token when authentication fails
 */
async function refreshDNSEToken() {
  if (!DNSE_USERNAME || !DNSE_PASSWORD) {
    console.error("❌ DNSE credentials not configured in environment");
    return null;
  }

  try {
    console.log("🔄 Refreshing DNSE token...");

    const response = await fetch(
      "https://api.dnse.com.vn/user-service/api/auth",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: DNSE_USERNAME,
          password: DNSE_PASSWORD,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ DNSE auth failed: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();

    if (!data.token) {
      console.error("❌ Invalid response from DNSE auth API:", data);
      return null;
    }

    console.log("✅ Successfully obtained new DNSE token");

    // Update user in database
    try {
      const user = await User.findByIdAndUpdate(
        TARGET_USER_ID,
        {
          investorToken: data.token,
        },
        { new: true }
      );

      if (user) {
        console.log(`✅ Updated user ${TARGET_USER_ID} with new token`);
      } else {
        console.warn(`⚠️ User ${TARGET_USER_ID} not found in database`);
      }
    } catch (dbError) {
      console.error("❌ Error updating user in database:", dbError);
    }

    return {
      investorToken: data.token,
      investorId: data.investorId,
    };
  } catch (error) {
    console.error("❌ Error refreshing DNSE token:", error.message);
    return null;
  }
}

// Create WebSocket server
const wss = new WebSocket.Server({ port: WSS_PORT });

console.log(`🚀 WebSocket server started on port ${WSS_PORT}`);
console.log(`🌐 Connect to: ws://localhost:${WSS_PORT}`);
console.log(`📡 MQTT Broker: ${BROKER_HOST}:${BROKER_PORT}`);
console.log(`🐛 Debug mode: ${DEBUG ? "ON" : "OFF"}`);
console.log(
  `🔄 Auto-refresh: ${DNSE_USERNAME && DNSE_PASSWORD ? "ENABLED" : "DISABLED"}`
);
if (DNSE_USERNAME && DNSE_PASSWORD) {
  console.log(`👤 Target User ID: ${TARGET_USER_ID}`);
}

/**
 * Subscribe to stock from MQTT and forward to WebSocket client
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} code - Stock code
 * @param {string} investorToken - DNSE investor token
 * @param {string} investorId - DNSE investor ID
 * @param {string} userId - MongoDB user ID
 * @param {number} retryCount - Retry counter to prevent infinite loops (max 1 retry)
 */
async function subscribeStockFromServer(
  ws,
  code,
  investorToken,
  investorId,
  userId,
  retryCount = 0
) {
  const clientId = `${CLIENT_ID_PREFIX}${randomInt(1000, 2000)}`;
  const topic = `plaintext/quotes/krx/mdds/v2/ohlc/stock/1D/${code}`;

  if (DEBUG) {
    console.log(`📡 [DEBUG] Subscribing to ${code} for client ${clientId}`);
  } else {
    console.log(`📡 Subscribing to ${code}`);
  }

  try {
    const client = mqtt.connect({
      host: BROKER_HOST,
      port: BROKER_PORT,
      protocol: "wss",
      path: "/wss",
      clientId: clientId,
      username: investorId,
      password: investorToken,
      rejectUnauthorized: false,
      protocolVersion: 5,
    });

    // Store MQTT client reference
    mqttClients.set(ws, { client, topic });

    const timeout = setTimeout(() => {
      console.log(`⏱️ Subscribe timeout for ${code}`);
      client.end();
      sendMessage(ws, {
        type: "error",
        code,
        error: "Subscribe timeout",
      });
    }, 10000);

    let messageReceived = false;

    client.on("connect", () => {
      console.log(`✅ MQTT connected for ${code}`);
      sendMessage(ws, {
        type: "connected",
        code,
        message: "Connected to MQTT",
      });

      client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.error(`❌ Subscribe error for ${code}:`, err);
          clearTimeout(timeout);
          client.end();
          sendMessage(ws, {
            type: "error",
            code,
            error: err.message,
          });
        } else {
          console.log(`✅ Subscribed to ${code}`);
          sendMessage(ws, {
            type: "subscribed",
            code,
            topic,
          });
        }
      });
    });

    // Handle MQTT messages
    client.on("message", async (receivedTopic, message) => {
      try {
        if (!messageReceived) {
          messageReceived = true;
          const payload = JSON.parse(message.toString());
          console.log("🚀 => payload:", payload);

          if (DEBUG) {
            console.log(`📨 [DEBUG] Received data for ${code}:`, payload);
          } else {
            console.log(`📨 Received price for ${code}: ${payload.close}`);
          }

          // Update stock price in database
          const stock = await Stock.findOne({ code: payload.symbol });
          console.log("🚀 => stock:", stock)
          if (stock && payload.close) {
            stock.marketPrice = payload.close * 1000;
            stock.highPrice = payload.high * 1000;
            stock.lowPrice = payload.low * 1000;
            stock.openPrice = payload.open * 1000;
            stock.volumn = payload.volume;
            stock.updatedAt = new Date();
            await stock.save();
            console.log(`💾 Updated ${code} price: ${payload.close * 1000}`);
          }

          // Send to WebSocket client
          sendMessage(ws, {
            type: "price_update",
            code,
            data: {
              symbol: payload.symbol,
              close: payload.close,
              marketPrice: payload.close * 1000,
              highPrice: payload.high * 1000,
              lowPrice: payload.low * 1000,
              openPrice: payload.open * 1000,
              volumn: payload.volume,
              timestamp: new Date().toISOString(),
            },
          });

          clearTimeout(timeout);
          client.end();
        }
      } catch (error) {
        console.error(`❌ Error processing message for ${code}:`, error);
        sendMessage(ws, {
          type: "error",
          code,
          error: error.message,
        });
      }
    });

    // Handle MQTT errors
    client.on("error", async (error) => {
      const errorMessage = error.message || String(error);
      console.error(`❌ MQTT error for ${code}:`, errorMessage);

      // Check if it's an authentication error
      if (
        errorMessage.includes("Bad User Name or Password") ||
        errorMessage.includes("Not authorized") ||
        errorMessage.includes("Authentication failed")
      ) {
        console.log(`🔄 Token expired for ${code}, attempting auto-refresh...`);

        // Prevent infinite retry loop
        if (retryCount >= 1) {
          console.error(`❌ Max retry attempts reached for ${code}`);
          sendMessage(ws, {
            type: "auth_error",
            code,
            error: "Authentication failed after token refresh attempt.",
          });
          clearTimeout(timeout);
          client.end();
          return;
        }

        // Try to refresh token automatically
        const newCredentials = await refreshDNSEToken();

        if (newCredentials) {
          console.log(`✅ Token refreshed successfully for ${code}`);
          console.log(`🔄 Auto-retrying subscription for ${code}...`);

          // Notify client about token refresh
          sendMessage(ws, {
            type: "token_refreshed",
            code,
            message: "Token refreshed automatically. Retrying subscription...",
            newCredentials: {
              investorToken: newCredentials.investorToken,
              investorId: newCredentials.investorId,
            },
          });

          // Clean up current connection
          clearTimeout(timeout);
          client.end();

          // Auto-retry subscription with new credentials
          try {
            await subscribeStockFromServer(
              ws,
              code,
              newCredentials.investorToken,
              newCredentials.investorId,
              userId,
              retryCount + 1 // Increment retry counter
            );
          } catch (retryError) {
            console.error(
              `❌ Retry subscription failed for ${code}:`,
              retryError
            );
            sendMessage(ws, {
              type: "error",
              code,
              error: "Retry subscription failed after token refresh.",
            });
          }

          return;
        } else {
          console.error(`❌ Failed to refresh token for ${code}`);

          sendMessage(ws, {
            type: "auth_error",
            code,
            error: "Authentication failed and token refresh failed.",
          });
        }

        clearTimeout(timeout);
        client.end();
        return;
      }

      sendMessage(ws, {
        type: "error",
        code,
        error: errorMessage,
      });

      clearTimeout(timeout);
      client.end();
    });

    // Handle timeout (no message received)
    setTimeout(() => {
      if (!messageReceived) {
        console.log(`⏰ No message received for ${code}, closing connection`);
        clearTimeout(timeout);
        client.end();
        sendMessage(ws, {
          type: "timeout",
          code,
          message: "No data received for stock",
        });
      }
    }, 5000);
  } catch (error) {
    console.error(`❌ Error subscribing to ${code}:`, error);
    sendMessage(ws, {
      type: "error",
      code,
      error: error.message,
    });
  }
}

/**
 * Send message to WebSocket client safely
 */
function sendMessage(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Handle batch subscribe requests
 */
async function subscribeBatch(ws, codes, investorToken, investorId, userId) {
  console.log(`📦 Batch subscribe for ${codes.length} stocks`);

  sendMessage(ws, {
    type: "batch_start",
    total: codes.length,
  });

  let successCount = 0;
  let failedCount = 0;

  // Process in batches to avoid overwhelming the broker
  const BATCH_SIZE = 10;
  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    const batch = codes.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map((code) =>
        subscribeStockFromServer(ws, code, investorToken, investorId, userId)
          .then(() => successCount++)
          .catch(() => failedCount++)
      )
    );

    // Progress update
    sendMessage(ws, {
      type: "batch_progress",
      processed: i + batch.length,
      total: codes.length,
      success: successCount,
      failed: failedCount,
    });

    // Delay between batches
    if (i + BATCH_SIZE < codes.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  sendMessage(ws, {
    type: "batch_complete",
    total: codes.length,
    success: successCount,
    failed: failedCount,
  });
}

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`👤 New client connected from ${clientIp}`);

  sendMessage(ws, {
    type: "connected",
    message: "Connected to WSS server",
    version: "1.0.0",
  });

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (DEBUG) {
        console.log(`📩 [DEBUG] Received message:`, message);
      } else {
        console.log(`📩 Received message: ${message.type}`);
      }

      switch (message.type) {
        case "subscribe":
          // Subscribe to single stock
          const { code, investorToken, investorId, userId } = message;
          if (!code || !investorToken || !investorId) {
            sendMessage(ws, {
              type: "error",
              error: "Missing required parameters",
            });
            return;
          }
          await subscribeStockFromServer(
            ws,
            code,
            investorToken,
            investorId,
            userId
          );
          break;

        case "subscribe_batch":
          // Subscribe to multiple stocks
          const {
            codes,
            investorToken: token,
            investorId: id,
            userId: uid,
          } = message;

          if (!codes || !Array.isArray(codes) || !token || !id) {
            sendMessage(ws, {
              type: "error",
              error: "Missing required parameters or invalid codes array",
            });
            return;
          }

          await subscribeBatch(ws, codes, token, id, uid);
          break;

        case "ping":
          sendMessage(ws, {
            type: "pong",
            timestamp: Date.now(),
          });
          break;

        case "health":
          sendMessage(ws, {
            type: "health",
            status: "ok",
            uptime: process.uptime(),
            connections: wss.clients.size,
            memory: process.memoryUsage(),
          });
          break;

        default:
          sendMessage(ws, {
            type: "error",
            error: "Unknown message type",
          });
      }
    } catch (error) {
      console.error("❌ Error handling message:", error);
      sendMessage(ws, {
        type: "error",
        error: error.message,
      });
    }
  });

  ws.on("close", () => {
    console.log("👋 Client disconnected");

    // Cleanup MQTT client if exists
    const mqttData = mqttClients.get(ws);
    if (mqttData) {
      const { client, topic } = mqttData;
      try {
        if (client.connected) {
          client.unsubscribe(topic);
          client.end();
        }
      } catch (error) {
        console.error("Error cleaning up MQTT client:", error);
      }
      mqttClients.delete(ws);
    }
  });

  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });
});

// Stats logging every 60 seconds
setInterval(() => {
  console.log(`📊 Active connections: ${wss.clients.size}`);
  console.log(
    `💾 Memory usage: ${Math.round(
      process.memoryUsage().heapUsed / 1024 / 1024
    )}MB`
  );
}, 60000);

// Graceful shutdown
function shutdown() {
  console.log("\n🛑 Shutting down WebSocket server...");

  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    client.close();
  });

  wss.close(() => {
    console.log("✅ WebSocket server closed");
    mongoose.connection.close().then(() => {
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    });
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error("⚠️ Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  shutdown();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});
