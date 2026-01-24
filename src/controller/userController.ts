import { Request, Response } from 'express';
import userService from '../services/userService';
import { success } from '../modules/responseHelper';

interface AuthenticatedRequest extends Request {
    user?: { id: string, name: string, email: string };
}

class UserController {
    async getAll(req: Request, res: Response) {
        const allUsers = await userService.findAll();
        res.json(success(allUsers));
    }

    async create(req: Request, res: Response) {
        const result = await userService.create(req.body);
        res.status(201).json(success(result));
    }

    async login(req: Request, res: Response) {
        const result = await userService.login(req.body);
        res.json(success(result));
    }

    async changePassword(req: AuthenticatedRequest, res: Response) {
        const userId = req.user!.id;
        const { oldPassword, newPassword } = req.body;

        const result = await userService.changePassword({
            userId,
            oldPassword,
            newPassword
        });

        res.json(success(result));
    }
}

export default new UserController();