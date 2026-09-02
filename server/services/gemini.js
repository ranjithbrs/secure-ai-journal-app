import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from '../config/secrets.js';

export async function analyzeJournalEntry(content, locationStr = '') {
  const apiKey = await getGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Analyze the following private journal entry.
Location Context: ${locationStr || 'Not specified'}

Journal Content:
"${content}"

Provide a JSON object response with:
1. "sentiment": String ("positive", "reflective", "neutral", "stressed", "anxious", "inspired")
2. "sentimentScore": Number (-1.0 to 1.0)
3. "summary": A brief 1-2 sentence summary.
4. "keyThemes": Array of 2-4 string keywords.
5. "aiReflectionPrompt": A gentle, supportive follow-up question for deep self-reflection.

Return ONLY valid JSON matching this schema without markdown codeblock backticks.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const rawText = response.text.replace(/```json|```/g, '').trim();
    return JSON.parse(rawText);
  } catch (err) {
    console.error('Gemini Analysis error:', err.message);
    return {
      sentiment: 'reflective',
      sentimentScore: 0.5,
      summary: content.slice(0, 100) + '...',
      keyThemes: ['journal', 'reflection'],
      aiReflectionPrompt: 'How did writing this entry make you feel?'
    };
  }
}

export async function chatWithCompanion(history, userMessage) {
  const apiKey = await getGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are MindReflect AI, a compassionate, empathetic, and insightful journaling assistant.
Your goal is to help the user process their thoughts, organize their goals, and maintain psychological safety.
Keep responses concise (under 150 words), encouraging, and introspective.`;

  try {
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction }
    });

    const response = await chat.sendMessage({ message: userMessage });
    return response.text;
  } catch (err) {
    console.error('Gemini Chat error:', err.message);
    return 'I am here with you. Could you share a bit more about what is on your mind?';
  }
}
