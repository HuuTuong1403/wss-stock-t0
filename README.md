# MQTT WebSocket Server

Standalone WebSocket server for MQTT stock price subscriptions from DNSE.

## Features

✅ WebSocket server for real-time communication  
✅ MQTT client for stock price subscriptions  
✅ MongoDB integration for price storage  
✅ Single & batch stock subscriptions  
✅ Auto-reconnect on auth errors  
✅ Graceful shutdown  
✅ Health monitoring  
✅ Debug mode  

## Quick Start

### 1. Install Dependencies

```bash
cd mqtt-wss-server
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update:

```env
MONGODB_URI=mongodb://localhost:27017/stock_t0
WSS_PORT=8080
```

### 3. Run Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

### 4. Test

```bash
npm test
```

## API Documentation

### WebSocket Connection

Connect to: `ws://localhost:8080` (development) or `wss://your-domain.com` (production)

### Message Types

#### 1. Subscribe Single Stock

**Request:**
```json
{
  "type": "subscribe",
  "code": "VND",
  "investorToken": "your-dnse-token",
  "investorId": "your-dnse-investor-id",
  "userId": "mongodb-user-id"
}
```

**Responses:**
- `connected` - Connected to MQTT broker
- `subscribed` - Subscribed to stock topic
- `price_update` - Price data received
- `error` - Error occurred
- `timeout` - No data received

#### 2. Subscribe Multiple Stocks (Batch)

**Request:**
```json
{
  "type": "subscribe_batch",
  "codes": ["VND", "HPG", "VIC"],
  "investorToken": "your-dnse-token",
  "investorId": "your-dnse-investor-id",
  "userId": "mongodb-user-id"
}
```

**Responses:**
- `batch_start` - Batch processing started
- `batch_progress` - Progress update
- `batch_complete` - All done

#### 3. Ping/Pong

**Request:**
```json
{
  "type": "ping"
}
```

**Response:**
```json
{
  "type": "pong",
  "timestamp": 1234567890
}
```

#### 4. Health Check

**Request:**
```json
{
  "type": "health"
}
```

**Response:**
```json
{
  "type": "health",
  "status": "ok",
  "uptime": 3600,
  "connections": 5,
  "memory": {...}
}
```

## Client Examples

### Node.js

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  // Subscribe to a stock
  ws.send(JSON.stringify({
    type: 'subscribe',
    code: 'VND',
    investorToken: 'your-token',
    investorId: 'your-id',
    userId: 'user-id'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Received:', message);
  
  if (message.type === 'price_update') {
    console.log(`${message.code}: ${message.data.marketPrice}`);
  }
});
```

### Browser

```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    code: 'VND',
    investorToken: 'your-token',
    investorId: 'your-id',
    userId: 'user-id'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

### Python

```python
import websocket
import json

def on_message(ws, message):
    data = json.loads(message)
    print('Received:', data)

ws = websocket.WebSocketApp(
    "ws://localhost:8080",
    on_message=on_message
)

ws.on_open = lambda ws: ws.send(json.dumps({
    "type": "subscribe",
    "code": "VND",
    "investorToken": "your-token",
    "investorId": "your-id",
    "userId": "user-id"
}))

ws.run_forever()
```

## Deployment

### PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start src/index.js --name mqtt-wss

# Auto-start on reboot
pm2 startup
pm2 save

# Monitor
pm2 logs mqtt-wss
pm2 monit
```

### Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 8080

CMD ["node", "src/index.js"]
```

Build and run:
```bash
docker build -t mqtt-wss-server .
docker run -d -p 8080:8080 --env-file .env mqtt-wss-server
```

### systemd

Create `/etc/systemd/system/mqtt-wss.service`:

```ini
[Unit]
Description=MQTT WebSocket Server
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/path/to/mqtt-wss-server
ExecStart=/usr/bin/node src/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable mqtt-wss
sudo systemctl start mqtt-wss
sudo systemctl status mqtt-wss
```

## Monitoring

### Logs

```bash
# PM2
pm2 logs mqtt-wss

# systemd
sudo journalctl -u mqtt-wss -f

# Docker
docker logs -f mqtt-wss-server
```

### Stats

The server logs stats every 60 seconds:
```
📊 Active connections: 5
💾 Memory usage: 45MB
```

### Health Endpoint

Send a WebSocket message:
```json
{
  "type": "health"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/stock_t0` | MongoDB connection string |
| `WSS_PORT` | `8080` | WebSocket server port |
| `BROKER_HOST` | `datafeed-lts-krx.dnse.com.vn` | MQTT broker host |
| `BROKER_PORT` | `443` | MQTT broker port |
| `DEBUG` | `false` | Enable debug logging |
| `NODE_ENV` | `development` | Environment mode |
| `DNSE_USERNAME` | - | DNSE username for auto-refresh (optional) |
| `DNSE_PASSWORD` | - | DNSE password for auto-refresh (optional) |
| `TARGET_USER_ID` | `6965f14d5ad4273f2010d5a4` | User ID to update when token refreshed |

### Auto-Refresh & Auto-Retry Feature 🔄

When `DNSE_USERNAME` and `DNSE_PASSWORD` are configured, the server automatically:
1. Detects "Bad User Name or Password" errors
2. Calls DNSE auth API to get new token
3. Updates the user in MongoDB with new credentials
4. **Automatically retries the subscription with new token**
5. Client receives data seamlessly - no manual retry needed!

**Client benefits:**
- ✅ No need to handle token refresh manually
- ✅ No need to retry subscription
- ✅ Seamless experience - just receive data!

See [AUTO_RETRY_FLOW.md](./AUTO_RETRY_FLOW.md) for detailed flow explanation.

## Troubleshooting

### Port already in use

```bash
# Find process
lsof -i :8080

# Kill process
kill -9 <PID>
```

### MongoDB connection failed

```bash
# Check MongoDB status
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod
```

### High memory usage

Restart the server:
```bash
pm2 restart mqtt-wss
```

Or increase memory limit:
```bash
pm2 start src/index.js --name mqtt-wss --max-memory-restart 500M
```

## Performance Tips

1. **Use PM2 cluster mode** for multiple CPU cores:
   ```bash
   pm2 start src/index.js -i max --name mqtt-wss
   ```

2. **Enable compression** for WebSocket messages

3. **Use connection pooling** for MongoDB

4. **Monitor memory** and restart if needed

5. **Use Redis** for session storage (future improvement)

## License

MIT

## Support

For issues or questions, contact your development team.
