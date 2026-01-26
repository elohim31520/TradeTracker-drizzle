export interface UserPayload {
  userId: string;
  email: string;
  role?: string;
}

export interface Admin {
  id: string
  userId: string
  createdAt: Date
  updatedAt?: Date
}

export interface User {
  id: string
  name: string
  email: string
  createdAt: Date
  updatedAt: Date
}

export interface UserWithAdmin extends User {
  admin: Admin | null
  isAdmin: boolean
} 