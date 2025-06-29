import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";

const validate =
  (schema: AnyZodObject) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (e) {
      if (e instanceof ZodError) {
        const formattedErrors = e.errors.reduce((acc, err) => {
          const field = err.path.slice(-1)[0] || "unknown";
          if (!acc[field]) {
            acc[field] = [];
          }
          acc[field].push(err.message);
          return acc;
        }, {} as Record<string, string[]>);

        res.status(400).json({
          message: "validation error",
          errors: formattedErrors,
        });
        return;
      }
      res.status(500).json({ message: "Internal server error" });
    }
  };

export default validate;
