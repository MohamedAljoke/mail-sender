// Initialize tracing FIRST (must be before other imports)
const { tracer } = require("./tracing");

const express = require("express");
const cors = require("cors");
const amqp = require("amqplib");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("redis");
const { trace, SpanStatusCode } = require("@opentelemetry/api");
const WebSocket = require("ws");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 3000;
const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://admin:password@localhost:5672";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let rabbitConnection = null;
let rabbitChannel = null;
let redisClient = null;
let wss = null;

// WebSocket broadcast helper
function broadcastToClients(message) {
  if (!wss) return;

  const messageStr = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint for ECS
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "api",
    timestamp: new Date().toISOString(),
  });
});

// Ready check endpoint for ECS
app.get("/ready", (req, res) => {
  res.status(200).json({
    status: "ready",
    service: "api",
    timestamp: new Date().toISOString(),
  });
});

// Redis connection setup
async function connectToRedis() {
  try {
    console.log("Connecting to Redis...");
    redisClient = createClient({ url: REDIS_URL });

    redisClient.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    await redisClient.connect();
    console.log("Connected to Redis successfully");

    // Set up Redis pub/sub for job status updates
    await setupRedisPubSub();
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    // Retry connection after 5 seconds
    setTimeout(connectToRedis, 5000);
  }
}

// Redis pub/sub setup for real-time updates
async function setupRedisPubSub() {
  try {
    const subscriber = redisClient.duplicate();
    await subscriber.connect();

    await subscriber.subscribe("job_status_updates", (message) => {
      try {
        const jobUpdate = JSON.parse(message);
        console.log("Received job status update:", jobUpdate);

        // Broadcast to all WebSocket clients
        broadcastToClients({
          type: "job_status_update",
          data: jobUpdate,
        });
      } catch (error) {
        console.error("Error processing job status update:", error);
      }
    });

    console.log("Redis pub/sub setup completed");
  } catch (error) {
    console.error("Failed to setup Redis pub/sub:", error);
  }
}

// RabbitMQ connection setup
async function connectToRabbitMQ() {
  try {
    console.log("Connecting to RabbitMQ...");
    rabbitConnection = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await rabbitConnection.createChannel();

    // Declare the email_tasks queue
    await rabbitChannel.assertQueue("email_tasks", { durable: true });

    console.log("Connected to RabbitMQ successfully");
  } catch (error) {
    console.error("Failed to connect to RabbitMQ:", error);
    // Retry connection after 5 seconds
    setTimeout(connectToRabbitMQ, 5000);
  }
}

// Email API endpoints
app.post("/api/emails", async (req, res) => {
  // Create a span for the email submission
  const span = tracer.startSpan("submit_email", {
    attributes: {
      "email.operation": "submit",
      "http.method": "POST",
      "http.route": "/api/emails",
    },
  });

  try {
    const { to, subject, body } = req.body;

    // Add email details to span
    span.setAttributes({
      "email.to": to,
      "email.subject": subject,
      "email.body_length": body?.length || 0,
    });

    // Validate input
    if (!to || !subject || !body) {
      span.recordException(new Error("Missing required fields"));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: "Validation failed",
      });
      return res.status(400).json({
        error: "Missing required fields: to, subject, body",
      });
    }

    // Create job
    const jobId = uuidv4();
    span.setAttributes({ "email.job_id": jobId });

    const emailJob = {
      job_id: jobId,
      to: to,
      subject: subject,
      body: body,
      created_at: new Date().toISOString(),
    };

    // Store initial status in Redis
    if (!redisClient) {
      span.recordException(new Error("Redis not connected"));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: "Redis unavailable",
      });
      return res.status(503).json({ error: "Redis not connected" });
    }

    const jobStatus = {
      job_id: jobId,
      status: "queued",
      to: to,
      subject: subject,
      created_at: emailJob.created_at,
      updated_at: new Date().toISOString(),
      history: [
        {
          status: "queued",
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // Store job status with tracing
    const redisSpan = tracer.startSpan("redis_store_job", { parent: span });
    try {
      await redisClient.setEx(`job:${jobId}`, 86400, JSON.stringify(jobStatus));
      redisSpan.setAttributes({
        "redis.operation": "setEx",
        "redis.key": `job:${jobId}`,
      });
    } catch (redisError) {
      redisSpan.recordException(redisError);
      redisSpan.setStatus({ code: SpanStatusCode.ERROR });
      throw redisError;
    } finally {
      redisSpan.end();
    }

    // Publish to RabbitMQ
    if (!rabbitChannel) {
      span.recordException(new Error("RabbitMQ not connected"));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: "RabbitMQ unavailable",
      });
      return res.status(503).json({ error: "RabbitMQ not connected" });
    }

    const rabbitSpan = tracer.startSpan("rabbitmq_publish", { parent: span });
    try {
      await rabbitChannel.sendToQueue(
        "email_tasks",
        Buffer.from(JSON.stringify(emailJob)),
        { persistent: true }
      );
      rabbitSpan.setAttributes({
        "rabbitmq.queue": "email_tasks",
        "rabbitmq.message_size": JSON.stringify(emailJob).length,
      });
    } catch (rabbitError) {
      rabbitSpan.recordException(rabbitError);
      rabbitSpan.setStatus({ code: SpanStatusCode.ERROR });
      throw rabbitError;
    } finally {
      rabbitSpan.end();
    }

    console.log(`Email job queued: ${jobId}`);

    // Broadcast new job creation to WebSocket clients
    broadcastToClients({
      type: "job_created",
      data: {
        job_id: jobId,
        to: to,
        subject: subject,
        status: "queued",
        created_at: emailJob.created_at,
      },
    });

    span.setStatus({ code: SpanStatusCode.OK });
    res.json({
      job_id: jobId,
      status: "queued",
      message: "Email job submitted successfully",
    });
  } catch (error) {
    console.error("Error processing email request:", error);
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    res.status(500).json({ error: "Internal server error" });
  } finally {
    span.end();
  }
});

app.get("/api/emails/:id", async (req, res) => {
  const span = tracer.startSpan("get_job_status", {
    attributes: {
      "email.operation": "get_status",
      "http.method": "GET",
      "http.route": "/api/emails/:id",
    },
  });

  try {
    const jobId = req.params.id;
    span.setAttributes({ "email.job_id": jobId });

    if (!redisClient) {
      span.recordException(new Error("Redis not connected"));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: "Redis unavailable",
      });
      return res.status(503).json({ error: "Redis not connected" });
    }

    // Get job status from Redis with tracing
    const redisSpan = tracer.startSpan("redis_get_job", { parent: span });
    let jobData;
    try {
      jobData = await redisClient.get(`job:${jobId}`);
      redisSpan.setAttributes({
        "redis.operation": "get",
        "redis.key": `job:${jobId}`,
      });
    } catch (redisError) {
      redisSpan.recordException(redisError);
      redisSpan.setStatus({ code: SpanStatusCode.ERROR });
      throw redisError;
    } finally {
      redisSpan.end();
    }

    if (!jobData) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "Job not found" });
      return res.status(404).json({
        error: "Job not found",
        job_id: jobId,
      });
    }

    const jobStatus = JSON.parse(jobData);
    span.setAttributes({
      "email.status": jobStatus.status,
      "email.retry_count": jobStatus.retry_count || 0,
    });

    span.setStatus({ code: SpanStatusCode.OK });
    res.json(jobStatus);
  } catch (error) {
    console.error("Error getting job status:", error);
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    res.status(500).json({ error: "Internal server error" });
  } finally {
    span.end();
  }
});

// Get job history
app.get("/api/jobs/history", async (req, res) => {
  try {
    if (!redisClient) {
      return res.status(503).json({ error: "Redis not connected" });
    }

    // Get all job keys
    const jobKeys = await redisClient.keys("job:*");
    const jobs = [];

    // Fetch each job's data
    for (const key of jobKeys) {
      try {
        const jobData = await redisClient.get(key);
        if (jobData) {
          const parsedJob = JSON.parse(jobData);
          jobs.push(parsedJob);
        }
      } catch (parseError) {
        console.error(`Error parsing job data for key ${key}:`, parseError);
      }
    }

    // Sort by created_at descending (newest first)
    jobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      total: jobs.length,
      jobs: jobs,
    });
  } catch (error) {
    console.error("Error getting job history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Graceful shutdown handling for ECS
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
wss = new WebSocket.Server({
  server,
  path: "/ws",
});

// WebSocket connection handling
wss.on("connection", (ws, req) => {
  console.log("New WebSocket connection established");

  // Send connection confirmation
  ws.send(
    JSON.stringify({
      type: "connection_status",
      data: { connected: true, timestamp: new Date().toISOString() },
    })
  );

  // Handle client messages
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Received WebSocket message:", data);

      // Handle different message types
      switch (data.type) {
        case "ping":
          ws.send(
            JSON.stringify({
              type: "pong",
              timestamp: new Date().toISOString(),
            })
          );
          break;
        case "subscribe_job":
          // Client wants updates for specific job
          ws.jobId = data.job_id;
          console.log(`Client subscribed to job: ${data.job_id}`);
          break;
        default:
          console.log("Unknown message type:", data.type);
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  });

  // Handle disconnection
  ws.on("close", () => {
    console.log("WebSocket connection closed");
  });

  // Handle errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// Start connections
connectToRedis();
connectToRabbitMQ();

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`API Service with WebSocket running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
