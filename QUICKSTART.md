# Quick Start - MQTT WebSocket Server

## 🚀 Setup in 3 Steps

### Step 1: Install & Configure

```bash
cd mqtt-wss-server
npm install
cp .env.example .env
```

Edit `.env`:
```env
MONGODB_URI=mongodb://localhost:27017/stock_t0
WSS_PORT=8080
```

### Step 2: Start Server

```bash
npm start
```

You should see:
```
✅ Connected to MongoDB
🚀 WebSocket server started on port 8080
🌐 Connect to: ws://localhost:8080
```

### Step 3: Test

```bash
npm test
```

Expected output:
```
✅ Test 1: Connection established
✅ Test 2: Connected message received
✅ Test 3: Ping-pong working
✅ Test 4: Health check working
🎉 All tests passed!
```

## 📝 Quick Test with wscat

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c ws://localhost:8080

# Send ping (paste this)
{"type":"ping"}

# Should receive
{"type":"pong","timestamp":1234567890}
```

## 🔗 Use from Next.js

In your Next.js project (`stock_t0`), add to `.env`:

```env
WSS_URL=ws://localhost:8080
```

Then use the client service:

```typescript
import { subscribeStockViaWSS } from "@/lib/services/mqtt-wss-client";

await subscribeStockViaWSS(
  "VND",
  investorToken,
  investorId,
  userId
);
```

## 📚 More Info

- [README.md](./README.md) - Full documentation
- [INTEGRATION.md](./INTEGRATION.md) - Integration with Next.js
- [API docs](./README.md#api-documentation) - Complete API reference

## ❓ Troubleshooting

**Port already in use:**
```bash
lsof -i :8080
kill -9 <PID>
```

**MongoDB not running:**
```bash
sudo systemctl start mongod
```

**Need help?**
Check logs and see [README.md](./README.md) for detailed troubleshooting.
