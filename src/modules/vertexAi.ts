import { GoogleGenAI, DynamicRetrievalConfigMode } from '@google/genai';
import 'dotenv/config';

const project = process.env.GCP_PROJECT_ID ?? '';
const location = 'us-central1';

export const ai = new GoogleGenAI({
    vertexai: true,
    project,
    location,
});

export const geminiConfig = {
    model: 'gemini-2.5-flash',
    config: {
        tools: [
            {
                googleSearch: {},
            },
        ],
    },
};