import { type Static, Type } from "typebox"
import { IdSchema } from "./document.js"

export const feedbackPath = "/api/feedback"
export const feedbackHeader = "X-Sketchbook-Feedback"
export const maxFeedbackBytes = 64 * 1024

export const FeedbackSchema = Type.Object(
  {
    chapterId: Type.Optional(IdSchema),
    notes: Type.Array(
      Type.Object(
        {
          comment: Type.String({ minLength: 1, maxLength: 2000, pattern: "\\S" }),
          blockId: Type.Optional(IdSchema),
          slideId: Type.Optional(IdSchema),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 10 },
    ),
  },
  { additionalProperties: false },
)

export type ViewerFeedback = Static<typeof FeedbackSchema>

export function removeViewerCapability(text: string, token: string, origin: string): string {
  return text
    .replaceAll(`#token=${token}`, "")
    .replaceAll(token, "[redacted]")
    .replaceAll(origin, "")
}
