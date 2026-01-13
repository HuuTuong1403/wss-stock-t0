# Changelog

## [1.0.0] - 2026-01-13

### Created
- 🎉 Initial release of standalone MQTT WebSocket Server
- ✅ Separated from Next.js project into independent module
- ✅ Full WebSocket server implementation
- ✅ MQTT client integration with DNSE broker
- ✅ MongoDB integration for stock price storage
- ✅ Single and batch stock subscription support

### Features
- WebSocket server on configurable port (default: 8080)
- MQTT broker connection with authentication
- Real-time stock price updates
- Automatic price storage to MongoDB
- Health check endpoint
- Ping/pong heartbeat
- Graceful shutdown handling
- Debug mode for troubleshooting
- Connection statistics logging
- Error handling and retry logic

### Documentation
- README.md - Complete API documentation
- QUICKSTART.md - Quick start guide
- INTEGRATION.md - Integration with Next.js
- CHANGELOG.md - This file

### Technical Details
- Node.js >= 18.0.0
- Dependencies:
  - ws: ^8.18.0 (WebSocket server)
  - mqtt: ^5.14.1 (MQTT client)
  - mongoose: ^9.1.2 (MongoDB ODM)
  - dotenv: ^17.2.3 (Environment variables)
- Modern MQTT connection (no deprecated url.parse)
- WeakMap for connection management
- Automatic cleanup on disconnect

### Migration
- Migrated from embedded code in Next.js API routes
- Now runs as independent microservice
- Can be deployed separately from main app
- Better separation of concerns
- Easier to scale and maintain

### Deployment Options
- PM2 (recommended for production)
- Docker/Docker Compose
- systemd service
- Can run on same or separate server

### Breaking Changes
- No longer embedded in Next.js project
- Requires separate installation and setup
- Must run as independent process
- Next.js apps need to connect via WebSocket

### Notes
- Fixes deprecation warning from url.parse()
- Improves code maintainability
- Centralizes MQTT logic
- Better monitoring and logging
- Production-ready with PM2 support
