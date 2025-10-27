
import { GoogleGenAI } from "@google/genai";
import type { Coordinates } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY not found in environment variables. Gemini features will be disabled.");
}

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

export const fetchLocationDescription = async (coords: Coordinates): Promise<string> => {
  if (!ai) {
    return Promise.resolve("AI features are currently unavailable. API key is missing.");
  }
  
  try {
    const prompt = `Provide a brief, tactical description for the location at latitude ${coords.lat} and longitude ${coords.lng}. Mention potential points of interest or geographical features. Keep it under 50 words.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const text = response.text;
    if (!text || text.trim() === '') {
      return "The AI returned an empty or invalid response for this location.";
    }
    return text;
  } catch (error) {
    console.error("Error fetching location description:", error);
    return "Could not retrieve location information at this time.";
  }
};
