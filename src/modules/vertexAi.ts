import { VertexAI } from '@google-cloud/vertexai';
import 'dotenv/config';

const project = process.env.GCP_PROJECT_ID ?? '';
const location = 'us-central1';

const vertex_ai = new VertexAI({ project: project, location: location });

export const geminiModel = vertex_ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
        responseMimeType: 'application/json',
    },
});