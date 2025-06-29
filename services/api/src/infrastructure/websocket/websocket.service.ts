import { Server as WebSocketServer } from "ws";
import { Server as HttpServer } from "http";
import { logger } from "../../shared/logger";

export interface WebSocketMessage {
  type: string;
  data?: unknown;
  timestamp?: string;
}

export interface IWebSocketService {
  initialize(server: HttpServer): void;
  broadcast(message: WebSocketMessage): void;
  sendToClient(clientId: string, message: WebSocketMessage): void;
  getConnectedClientsCount(): number;
  close(): Promise<void>;
}

export class WebSocketService implements IWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, any> = new Map();

  initialize(server: HttpServer): void {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
    });

    this.wss.on("connection", (ws, req) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);

      logger.info({
        message: "New WebSocket connection established",
        context: { clientId, clientsCount: this.clients.size },
      });

      this.sendMessage(ws, {
        type: "connection_status",
        data: {
          connected: true,
          clientId,
          timestamp: new Date().toISOString(),
        },
      });

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(clientId, ws, data);
        } catch (error) {
          logger.error({
            message: "Error processing WebSocket message",
            context: { clientId, error },
          });
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
        logger.info({
          message: "WebSocket connection closed",
          context: { clientId, clientsCount: this.clients.size },
        });
      });

      ws.on("error", (error) => {
        logger.error({
          message: "WebSocket error",
          context: { clientId, error },
        });
        this.clients.delete(clientId);
      });
    });

    logger.info({ message: "WebSocket server initialized" });
  }

  broadcast(message: WebSocketMessage): void {
    if (!this.wss) {
      logger.warn({ message: "WebSocket server not initialized" });
      return;
    }

    const messageStr = JSON.stringify({
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    });

    let sentCount = 0;
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(messageStr);
        sentCount++;
      }
    });

    logger.debug({
      message: "Broadcast message sent",
      context: {
        messageType: message.type,
        sentToClients: sentCount,
      },
    });
  }

  sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn({
        message: "Client not found for direct message",
        context: { clientId },
      });
      return;
    }

    if (client.readyState === 1) {
      this.sendMessage(client, message);
      logger.debug({
        message: "Direct message sent to client",
        context: { clientId, messageType: message.type },
      });
    } else {
      logger.warn({
        message: "Client connection not open",
        context: { clientId, readyState: client.readyState },
      });
    }
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  async close(): Promise<void> {
    if (!this.wss) return;

    return new Promise((resolve) => {
      this.wss!.close(() => {
        this.clients.clear();
        logger.info({ message: "WebSocket server closed" });
        resolve();
      });
    });
  }

  private handleClientMessage(clientId: string, ws: any, data: any): void {
    logger.debug({
      message: "Received WebSocket message",
      context: { clientId, messageType: data.type },
    });

    switch (data.type) {
      case "ping":
        this.sendMessage(ws, {
          type: "pong",
          timestamp: new Date().toISOString(),
        });
        break;

      case "subscribe_job":
        ws.jobId = data.job_id;
        logger.info({
          message: "Client subscribed to job updates",
          context: { clientId, jobId: data.job_id },
        });
        break;

      case "unsubscribe_job":
        delete ws.jobId;
        logger.info({
          message: "Client unsubscribed from job updates",
          context: { clientId },
        });
        break;

      default:
        logger.warn({
          message: "Unknown WebSocket message type",
          context: { clientId, messageType: data.type },
        });
    }
  }

  private sendMessage(ws: any, message: WebSocketMessage): void {
    const messageStr = JSON.stringify({
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    });
    ws.send(messageStr);
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  broadcastJobUpdate(jobId: string, jobUpdate: any): void {
    if (!this.wss) return;

    const message: WebSocketMessage = {
      type: "job_status_update",
      data: jobUpdate,
    };

    const messageStr = JSON.stringify({
      ...message,
      timestamp: new Date().toISOString(),
    });

    let sentCount = 0;
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) {
        if (!client.jobId || client.jobId === jobId) {
          client.send(messageStr);
          sentCount++;
        }
      }
    });

    logger.debug({
      message: "Job update broadcast sent",
      context: { jobId, sentToClients: sentCount },
    });
  }
}
