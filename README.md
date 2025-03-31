# MCP Telegram

A TypeScript implementation of an MCP (Model Context Protocol) server for working with Telegram through MTProto, built using FastMCP.

## Overview

This project provides a set of tools for interacting with Telegram through the MTProto protocol, making them available via an MCP server for use with AI models like Claude.

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### CLI Commands

The application provides the following CLI commands:

```bash
# Sign in to Telegram
npm run sign-in
# or
npx mcp-telegram sign-in

# Start the MCP server
npm run mcp
# or 
npx mcp-telegram mcp [options]

# Logout from Telegram
npm run logout
# or
npx mcp-telegram logout
```

CLI Options for the `mcp` command:
- `-t, --transport <type>`: Transport type (stdio, http, sse), defaults to 'stdio'
- `-p, --port <number>`: Port for HTTP/SSE transport, defaults to 3000
- `-e, --endpoint <path>`: Endpoint for SSE transport, defaults to 'mcp'

### Starting the MCP Server

Start the MCP server with stdio transport (default, used by Cursor AI):
```bash
npm run start
# or
npm run mcp
```

You can also run the server programmatically:

```typescript
import server, { startServer } from 'mcp-telegram';

// Start the server with the configuration
startServer(server);
```

### Environment Variables

The application uses the following environment variables:

- `TELEGRAM_API_ID`: Your Telegram API ID
- `TELEGRAM_API_HASH`: Your Telegram API Hash
- `TRANSPORT_TYPE`: Transport type ('stdio', 'http', or 'sse'), defaults to 'stdio'
- `PORT`: Port for HTTP or SSE transports, defaults to 3000
- `ENDPOINT`: Endpoint for SSE transport, defaults to 'mcp'
- `LOG_LEVEL`: Logging level, defaults to 'info'

These can be set in a `.env` file in the project root.

## Development

Development requires Node.js version 18 or higher.

```bash
# Run in development mode
npm run dev

# Lint the code
npm run lint

# Run tests
npm run test
```

## FastMCP Integration

The server is implemented using FastMCP, which provides a modern TypeScript implementation of the Model Context Protocol. It supports stdio, HTTP, and SSE transports, making it compatible with different client integration approaches.

### Server Transports

- **stdio**: Default transport, useful for direct integration with tools like Cursor AI
- **sse**: Server-Sent Events transport for real-time communication

## Available Tools

### listDialogs

List available dialogs, chats and channels.

Parameters:
- `unread`: Boolean, show only unread dialogs (default: false)
- `archived`: Boolean, include archived dialogs (default: false)
- `ignorePinned`: Boolean, ignore pinned dialogs (default: false)

### listMessages

List messages in a given dialog, chat or channel.

Parameters:
- `dialogId`: String, ID of the dialog to list messages from
- `unread`: Boolean, show only unread messages (default: false)
- `limit`: Number, maximum number of messages to retrieve (default: 100)

## Project Structure

```
src/
├── config.ts               # Application configuration
├── index.ts                # Main server implementation
├── mcp.ts                  # CLI entry point
├── tools/                  # Tool implementations
│   ├── index.ts            # Tools export
│   └── telegramTools.ts    # Telegram tools
├── lib/           # Core Telegram functionality
│   ├── index.ts            # Module exports
│   ├── telegram.ts         # Telegram client functionality
└── utils/                  # Utilities
    ├── errorHandler.ts     # Error handling utilities
    └── logger.ts           # Logging utility
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.