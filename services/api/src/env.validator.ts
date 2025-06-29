import { z } from "zod";

if (process.env.NODE_ENV === "test") {
  require("dotenv").config({ path: ".env.test" });
}

export const envSchema = z.object({
  PORT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .refine((val) => val === undefined || !isNaN(val), {
      message: "PORT must be a number if provided",
    }),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  RABBITMQ_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OTEL_EXPORTER_JAEGER_ENDPOINT: z.string().url(),
  OTEL_SERVICE_NAME: z.string(),
  OTEL_RESOURCE_ATTRIBUTES: z.string(),
  
  // Message broker configuration
  MESSAGE_BROKER_TYPE: z.enum(["rabbitmq", "sqs"]).optional().default("rabbitmq"),
  
  // AWS SQS configuration (optional)
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SQS_ENDPOINT: z.string().optional(), // For LocalStack
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    "❌ Invalid OR Missing environment variables:",
    parsedEnv.error.format()
  );
  process.exit(1);
}

export const env = parsedEnv.data;
