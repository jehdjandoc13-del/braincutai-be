import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";

const app = express();
const port = Number(process.env.PORT || 4000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 30 }
});
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "braincutai-be" }));

app.post("/api/analyze", upload.array("images", 30), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "put_your_api_key_here") {
      return res.status(500).json({ error: "OpenAI API key is not configured. Add it to braincutai-be/.env and restart the backend." });
    }
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "Upload at least one image panel." });
    const panelMeta = JSON.parse(req.body.panels || "[]");
    const language = ({ bisaya: "Cebuano/Bisaya", filipino: "Filipino", english: "English" })[req.body.language] || "Cebuano/Bisaya";
    const style = ({
      faithful: "faithful panel-by-panel adaptation",
      dramatic: "dramatic storytelling",
      recap: "energetic anime recap",
      cinematic: "cinematic narrator"
    })[req.body.style] || "faithful panel-by-panel adaptation";

    const content = [{
      type: "input_text",
      text: `You are the story editor for BrainCut AI Studio. Analyze the attached manga/manhwa panels in the exact supplied order.
Output language: ${language}. Adaptation style: ${style}.
User-provided context: ${req.body.context || "(none)"}.
Panel notes and corrected speech bubble text, in matching order: ${JSON.stringify(panelMeta)}.

Inspect visible actions, facial expressions, backgrounds, scene changes, and speech bubbles. Read text only when legible; do not fabricate exact quotes when text is unreadable. Treat user-entered dialogue and notes as strong hints. Keep story order and don't invent major events. Mark uncertain character identities generically rather than guessing names.
Create a useful dubbing script with:
SUMMARY: a short 2-4 sentence summary.
SCRIPT: title and scene-by-scene entries. For each panel/scene include visual direction, narrator line if useful, speaker-labeled dialogue when identifiable, and emotion/voice direction. Write natural lines that are easy to speak aloud. Avoid repetitive narration. Plain text only, in ${language}.`
    }];

    for (const file of files) {
      if (!file.mimetype.startsWith("image/")) continue;
      content.push({
        type: "input_image",
        image_url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
        detail: "high"
      });
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content }],
      max_output_tokens: 5000
    });
    const output = response.output_text || "";
    const summaryMatch = output.match(/SUMMARY:\s*([\s\S]*?)(?=SCRIPT:|$)/i);
    const scriptMatch = output.match(/SCRIPT:\s*([\s\S]*)/i);
    res.json({
      summary: (summaryMatch?.[1] || "Review the script draft below.").trim(),
      script: (scriptMatch?.[1] || output).trim()
    });
  } catch (error) {
    console.error("Panel analysis failed:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected backend error." });
  }
});

app.listen(port, () => console.log(`BrainCut AI backend listening at http://localhost:${port}`));
