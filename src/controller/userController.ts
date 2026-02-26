import { Request, Response, NextFunction } from 'express';
import userService from '../services/userService';
import { success } from '../modules/responseHelper';

interface AuthenticatedRequest extends Request {
    user?: { id: string, name: string, email: string };
}

async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const allUsers = await userService.findAll();
        res.json(success(allUsers));
    } catch (error) {
        next(error);
    }
}

async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const result = await userService.create(req.body);
        res.status(201).json(success(result));
    } catch (error) {
        next(error);
    }
}

async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const result = await userService.login(req.body);
        res.json(success(result));
    } catch (error) {
        next(error);
    }
}

async function changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const userId = req.user!.id;
        const { oldPassword, newPassword } = req.body;

        const result = await userService.changePassword({
            userId,
            oldPassword,
            newPassword
        });

        res.json(success(result));
    } catch (error) {
        next(error);
    }
}

async function googleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { credential } = req.body;
        const result = await userService.handleGoogleCredential(credential);
        res.json(success(result));
    } catch (error) {
        next(error);
    }
}

export default {
    getAll,
    create,
    login,
    changePassword,
    googleLogin
};