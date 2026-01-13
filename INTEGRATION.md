# Integration Guide với Next.js Project

Hướng dẫn tích hợp MQTT WebSocket Server với Next.js project.

## Cấu trúc thư mục

```
your-project/
├── stock_t0/                    # Next.js project
│   ├── app/
│   ├── lib/
│   │   └── services/
│   │       └── mqtt-wss-client.ts  # Client để gọi WSS
│   ├── package.json
│   └── ...
│
└── mqtt-wss-server/             # WebSocket server (INDEPENDENT)
    ├── src/
    │   └── index.js
    ├── test/
    ├── package.json
    └── README.md
```

## Setup

### 1. Cài đặt WebSocket Server

```bash
# Đi vào thư mục mqtt-wss-server
cd mqtt-wss-server

# Cài dependencies
npm install

# Copy .env.example và cấu hình
cp .env.example .env

# Edit .env với thông tin của bạn
nano .env
```

### 2. Start WebSocket Server

```bash
# Development
npm run dev

# Production
npm start
```

Server sẽ chạy trên `ws://localhost:8080`

### 3. Cấu hình Next.js Project

Trong Next.js project (`stock_t0`), thêm biến môi trường:

**`.env` (trong stock_t0):**
```env
# WebSocket Server URL
WSS_URL=ws://localhost:8080  # Development
# WSS_URL=wss://your-wss-server.com  # Production
```

### 4. Sử dụng Client Service

File `lib/services/mqtt-wss-client.ts` đã được tạo sẵn. Sử dụng trong API routes:

**Example: `app/api/stocks/[id]/route.ts`**

```typescript
import { subscribeStockViaWSS } from "@/lib/services/mqtt-wss-client";

export async function PUT(request: NextRequest, { params }: RouteParams) {
  // ... existing code ...
  
  if (stock.marketPrice === 0 && investorToken && investorId) {
    // Gọi WebSocket server để subscribe
    subscribeStockViaWSS(
      stock.code,
      investorToken,
      investorId,
      user._id.toString()
    ).catch((error) => {
      console.error(`Error subscribing ${stock.code}:`, error);
    });
  }
  
  return NextResponse.json(stock);
}
```

## Development Workflow

### Terminal 1: WebSocket Server
```bash
cd mqtt-wss-server
npm run dev
```

### Terminal 2: Next.js App
```bash
cd stock_t0
npm run dev
```

### Terminal 3: MongoDB (nếu chưa chạy)
```bash
mongod
```

## Production Deployment

### Option 1: Cùng Server (Simple)

**Setup PM2:**
```bash
# Install PM2
npm install -g pm2

# Start WebSocket Server
cd mqtt-wss-server
pm2 start src/index.js --name mqtt-wss

# Start Next.js App
cd ../stock_t0
pm2 start npm --name nextjs -- start

# Save configuration
pm2 save
pm2 startup
```

**Nginx Configuration:**
```nginx
# WebSocket Server
upstream mqtt_wss {
    server localhost:8080;
}

# Next.js App
upstream nextjs_app {
    server localhost:3000;
}

server {
    listen 80;
    server_name yourdomain.com;

    # Next.js App
    location / {
        proxy_pass http://nextjs_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket Server
    location /wss {
        proxy_pass http://mqtt_wss;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

Environment:
```env
# stock_t0/.env
WSS_URL=ws://yourdomain.com/wss

# mqtt-wss-server/.env
WSS_PORT=8080
MONGODB_URI=mongodb://localhost:27017/stock_t0
```

### Option 2: Separate Servers (Recommended)

**Server 1 (Next.js):**
```bash
cd stock_t0
npm run build
pm2 start npm --name nextjs -- start
```

Environment:
```env
WSS_URL=wss://wss-server.yourdomain.com
```

**Server 2 (WebSocket):**
```bash
cd mqtt-wss-server
pm2 start src/index.js --name mqtt-wss
```

Environment:
```env
WSS_PORT=8080
MONGODB_URI=mongodb://your-mongodb-server:27017/stock_t0
```

### Option 3: Docker Compose

**docker-compose.yml** (trong root project):

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    volumes:
      - mongodb_data:/data/db
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_DATABASE=stock_t0

  mqtt-wss:
    build: ./mqtt-wss-server
    ports:
      - "8080:8080"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/stock_t0
      - WSS_PORT=8080
    depends_on:
      - mongodb
    restart: unless-stopped

  nextjs:
    build: ./stock_t0
    ports:
      - "3000:3000"
    environment:
      - WSS_URL=ws://mqtt-wss:8080
      - MONGODB_URI=mongodb://mongodb:27017/stock_t0
    depends_on:
      - mongodb
      - mqtt-wss
    restart: unless-stopped

volumes:
  mongodb_data:
```

**mqtt-wss-server/Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 8080

CMD ["node", "src/index.js"]
```

Start everything:
```bash
docker-compose up -d
```

## Vercel Deployment (Next.js)

Next.js app có thể deploy lên Vercel, nhưng WebSocket server cần host riêng:

**1. Deploy WebSocket Server (VPS/EC2/Railway):**
```bash
# On your VPS
git clone <repo>
cd mqtt-wss-server
npm install
pm2 start src/index.js --name mqtt-wss
```

**2. Deploy Next.js lên Vercel:**
```bash
cd stock_t0
vercel
```

**3. Cấu hình Environment Variables trên Vercel:**
```
WSS_URL=wss://your-wss-server.com
```

## Testing Integration

### 1. Test WebSocket Server

```bash
cd mqtt-wss-server
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

### 2. Test từ Next.js API

Gọi API endpoint để tạo hoặc update stock:

```bash
# Create stock
curl -X POST http://localhost:3000/api/stocks \
  -H "Content-Type: application/json" \
  -d '{
    "code": "VND",
    "name": "VNDirect",
    "industry": "Securities"
  }'

# Update stock (sẽ trigger subscribe)
curl -X PUT http://localhost:3000/api/stocks/VND \
  -H "Content-Type: application/json" \
  -d '{
    "marketPrice": 0
  }'
```

Check logs của WebSocket server:
```
📡 Subscribing to VND
✅ MQTT connected for VND
✅ Subscribed to VND
📨 Received price for VND: 25.5
💾 Updated VND price: 25500
```

## Monitoring

### WebSocket Server Health

```bash
# Send health check via wscat
npm install -g wscat
wscat -c ws://localhost:8080

# Then send:
{"type":"health"}

# Response:
{
  "type": "health",
  "status": "ok",
  "uptime": 3600,
  "connections": 2,
  "memory": {...}
}
```

### PM2 Monitoring

```bash
# View logs
pm2 logs mqtt-wss
pm2 logs nextjs

# Monitor resources
pm2 monit

# Status
pm2 status
```

## Troubleshooting

### Next.js không connect được tới WebSocket Server

1. Check WSS_URL trong `.env`:
   ```bash
   cat stock_t0/.env | grep WSS_URL
   ```

2. Test WebSocket server:
   ```bash
   cd mqtt-wss-server
   npm test
   ```

3. Check firewall:
   ```bash
   # Allow port 8080
   sudo ufw allow 8080
   ```

### WebSocket Server không kết nối được MongoDB

1. Check MongoDB status:
   ```bash
   sudo systemctl status mongod
   ```

2. Check connection string:
   ```bash
   cat mqtt-wss-server/.env | grep MONGODB_URI
   ```

3. Test connection:
   ```bash
   mongosh "mongodb://localhost:27017/stock_t0"
   ```

### MQTT authentication failed

1. Token đã hết hạn → Client cần refresh token
2. Check investorId và investorToken
3. Xem logs để biết error cụ thể

## Migration từ Code Cũ

Xem file [MIGRATION_EXAMPLE.md](../wss-server/MIGRATION_EXAMPLE.md) để biết cách migrate từ code cũ (MQTT trực tiếp trong API endpoints) sang WebSocket server.

## Best Practices

1. **Always run WebSocket server trước khi start Next.js app**
2. **Use PM2** cho production để auto-restart
3. **Monitor logs** thường xuyên
4. **Set up alerts** cho errors
5. **Backup MongoDB** định kỳ
6. **Use environment variables** cho tất cả configs
7. **Enable DEBUG mode** khi cần troubleshoot
8. **Test health endpoint** trước khi deploy

## Support

Nếu gặp vấn đề:
1. Check logs của cả 2 servers
2. Run test suite
3. Verify environment variables
4. Contact development team
