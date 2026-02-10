import { Request } from 'express'
import { Part } from '@google-cloud/vertexai';

declare global {
  namespace Express {
    interface Request {
      imagePart?: Part;
      user?: {
        id: string
        email: string
        name: string
      }
    }
  }
}
export { }