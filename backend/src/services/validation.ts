import { z } from "zod";

export const analyseRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(5, "Prompt must be at least 5 characters.")
    .max(2000, "Prompt must be 2000 characters or fewer."),
  documentIds: z
    .array(z.string().uuid("Each documentId must be a UUID."))
    .min(1, "At least one documentId is required.")
    .max(20, "No more than 20 documents can be analysed at once."),
});

export type AnalyseRequest = z.infer<typeof analyseRequestSchema>;
