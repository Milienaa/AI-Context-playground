import {
    GoogleGenAI,
    Chat,
    FunctionDeclaration,
    GenerateContentResponse,
    Tool,
    Type,
  } from "@google/genai";
  import {
    SYSTEM_INSTRUCTION_BASE,
    CONTEXT_MANAGEMENT_INSTRUCTION,
    STRICT_OUTPUT_INSTRUCTION,
  } from "../constants";
  import { GroundingSource } from "../types";
  import { sendMarkdownToXtiles } from "./xtilesService";
  
  // ✅ API_KEY з env
  const API_KEY = process.env.API_KEY;
  if (!API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }
  
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const contextProjectTool: FunctionDeclaration = {
    name: "contextProjectTool",
    description:
      "Creates and continuously updates the single, holistic context for the entire project. On the first turn, establish the project's core goal. On subsequent turns, integrate the user's new request to refine and expand the existing project context, maintaining a coherent brief.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        context: {
          type: Type.STRING,
          description:
            "A concise summary of the project's global purpose and what it is about, updated with the latest user input.",
        },
      },
      required: ["context"],
    },
  };
  
  let chat: Chat | undefined;
  
  export function resetChat() {
    chat = undefined;
  }
  
  function initializeChat(useContextTool: boolean): Chat {
    const tools: Tool[] = [];
    let systemInstruction: string;
  
    if (useContextTool) {
      tools.push({ functionDeclarations: [contextProjectTool] });
      systemInstruction = `${CONTEXT_MANAGEMENT_INSTRUCTION}\n\n${SYSTEM_INSTRUCTION_BASE}`;
    } else {
      systemInstruction = `${STRICT_OUTPUT_INSTRUCTION}\n\n${SYSTEM_INSTRUCTION_BASE}`;
    }
  
    return ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction,
        tools,
      },
    });
  }
  
  export const getChat = (useContextTool: boolean): Chat => {
    if (!chat) chat = initializeChat(useContextTool);
    return chat;
  };
  
  interface GeminiResponse {
    text: string;
    sources: GroundingSource[];
    projectContext?: string;
    inputTokens: number;
    outputTokens: number;
    projectUrl?: string;
    projectId?: string;
  }
  
  // ⬇️ sendMessage: рядок або Part[] (без role)
  export async function sendMessageToGemini(
    message: string,
    useContextTool: boolean,
    includeHistory: boolean,
    currentProjectId?: string
  ): Promise<GeminiResponse> {
    const chatSession = includeHistory ? getChat(useContextTool) : initializeChat(useContextTool);
  
    const finalResponse: GeminiResponse = {
      text: "",
      sources: [],
      projectContext: undefined,
      inputTokens: 0,
      outputTokens: 0,
    };
  
    try {
      // ✅ передаємо як { message: string }
      let response: GenerateContentResponse = await chatSession.sendMessage({ message });
  
      if (response.usageMetadata) {
        finalResponse.inputTokens += response.usageMetadata.promptTokenCount ?? 0;
        finalResponse.outputTokens += response.usageMetadata.candidatesTokenCount ?? 0;
      }
  
      // Обробка можливого functionCall
      let keepLooping = true;
      while (keepLooping) {
        const parts = response.candidates?.[0]?.content?.parts ?? [];
        const fnCall = parts.find((p) => (p as any).functionCall)?.functionCall as
          | { name: string; args?: Record<string, unknown> }
          | undefined;
  
        if (fnCall?.name === "contextProjectTool") {
          const context =
            typeof fnCall.args?.["context"] === "string"
              ? (fnCall.args!["context"] as string)
              : undefined;
          if (context) finalResponse.projectContext = context;
  
          // ✅ tool-відповідь — масив Part’ів (БЕЗ role)
          const toolParts = [
            {
              functionResponse: {
                name: "contextProjectTool",
                response: { success: true },
              },
            },
          ] as const;
  
          response = await chatSession.sendMessage({
            message: toolParts as unknown as any[],
          });
  
          if (response.usageMetadata) {
            finalResponse.inputTokens += response.usageMetadata.promptTokenCount ?? 0;
            finalResponse.outputTokens += response.usageMetadata.candidatesTokenCount ?? 0;
          }
        } else {
          keepLooping = false;
        }
      }
  
      // ✅ Markdown від Gemini
      const md = (response.text ?? "").trim();
      finalResponse.text = md;
  
      // ⬇️ Один (!) виклик до xTiles з урахуванням projectId
      try {
        const { url, projectId } = await sendMarkdownToXtiles(md, currentProjectId);
        finalResponse.projectUrl = url;
        finalResponse.projectId = projectId ?? currentProjectId;
      } catch (e) {
        console.error("Failed to send to xTiles:", e);
      }
  
      // Джерела (grounding)
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata?.groundingChunks) {
        finalResponse.sources = groundingMetadata.groundingChunks
          .map((chunk) => chunk.web)
          .filter((web): web is { uri: string; title: string } => !!web && !!web.uri);
      }
  
      return finalResponse;
    } catch (error) {
      console.error("Error sending message to Gemini:", error);
      return {
        text: "Вибачте, сталася помилка. Спробуйте ще раз.",
        sources: [],
        projectContext: undefined,
        inputTokens: 0,
        outputTokens: 0,
        projectUrl: undefined,
        projectId: currentProjectId, // збережемо, якщо він уже був
      };
    }
  }
  