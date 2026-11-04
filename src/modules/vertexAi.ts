import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const project = process.env.GCP_PROJECT_ID;
if (!project) {
    throw new Error('GCP_PROJECT_ID is not set');
}
const location = 'global';

export const ai = new GoogleGenAI({
    vertexai: true,
    project,
    location,
});

export const geminiConfig = {
    model: 'gemini-3.8-flash',
    config: {
        tools: [
            {
                googleSearch: {},
            },
        ],
    },
};