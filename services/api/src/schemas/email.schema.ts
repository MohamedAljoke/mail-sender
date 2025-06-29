import { z } from "zod";

export const emailJobSchema = z.object({
  body: z.object({
    to: z.string().email("Invalid email address format").min(1, "Email is required"),
    subject: z.string().min(1, "Subject is required").max(200, "Subject cannot exceed 200 characters"),
    body: z.string().min(1, "Body is required").max(10000, "Body cannot exceed 10,000 characters"),
  }),
});

export type EmailJobRequest = z.infer<typeof emailJobSchema>["body"];