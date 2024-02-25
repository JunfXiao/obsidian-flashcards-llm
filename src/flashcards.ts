import { Configuration, OpenAIApi } from "openai";

class OpenAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIError";
  }
}

function extractTextAfterFlashcards(text: string): string | null {
  const pattern = /#flashcards.*\n/;
  const match = text.match(pattern);

  if (match) {
    const startIdx = match.index! + match[0].length;
    return text.substring(startIdx);
  }

  return null;
}


export async function generateFlashcards(text: string, apiKey: string, model = "text-davinci-003", sep = "::", flashcardCount = 5): Promise<string> {
  const configuration = new Configuration({
    apiKey: apiKey,
  });

  const openai = new OpenAIApi(configuration);

  const cleanedText = text.replace(/<!--.*-->[\n]?/g, "");
  const flashcardText = cleanedText

  const basePrompt = `You're an Anki Flashcards generator. The user will provide you with a note. At the end of the note are some flashcards. You should think step by step and generate flashcards following these rules: 
  1. First identify which are the most important concepts within the note. Focus on important concepts, latex formulas and equations.
  2. At the end of user's note (that is after #flashcards tag), you will find some existing flashcards. Read those flashcards, ignore those basicblock-start and basicblock-end flags and AVOID CREATING FLASHCARDS WITH SIMILAR CONTENTS OR QUESTIONS LIKE THEM. DO NOT REPEAT OR REPHRASE THESE EXISTING FLASHCARDS.
  3. And then generate at most ${flashcardCount} new original flashcards in the format "question ${sep} answer". Strictly use ${sep} to separate a question from its answer. Separate flashcards with a single newline. An example is "What is chemical formula of water ${sep} H2O". Do not use any prefix text, start generating right away. Try to make them as atomic as possible, but still challenging and rich of information. 
  4. Please typeset equations and math formulas correctly (that is using the $ symbol).
  5. You should reply always in German if the input is in German.
  6. Your output flashcards should always follow "question ${sep} answer" format with no flags from rule 3.`;

  const additionalPrompt = "Additional information on the task: Focus primarily on formulas and equations. Do NOT always start the questions with What. Do not repeat questions. Do not rephrase questions already generated. You can also ask the user to describe something or detail a given concept. You can even write flashcards asking to fill a missing word or phrase.";

  let response = null;
  if (model == "text-davinci-003") {
    const prompt = `${basePrompt}
${flashcardText}`;
    response = await openai.createCompletion({
      model,
      prompt,
      temperature: 0.7,
      max_tokens: 300,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    });
  } else {
    response = await openai.createChatCompletion({
      model,
      temperature: 0.7,
      max_tokens: 1000,
      frequency_penalty: 0,
      presence_penalty: 0,
      top_p: 1,
      messages: [{ role: "system", content: basePrompt }, { role: "user", content: flashcardText }]
    }, { timeout: 1e4 });
  }

  console.log(response);
  let data = response?.data?.choices?.[0] as any;

  if (!data) {

    throw new OpenAIError("No response received from OpenAI API");
  }


  if (data?.hasOwnProperty("message")) {
    data = data.message;
  }
  if (data?.hasOwnProperty("text")) {
    data = data.text;
  }

  if (data?.hasOwnProperty("content")) {
    data = data.content;
  }
  if (typeof data === "string") {
    return data.trim();
  }

  console.error(response);
  throw new OpenAIError("Cannot recognize the response received from OpenAI API");

}
