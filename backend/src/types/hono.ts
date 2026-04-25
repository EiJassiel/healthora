export interface AuthUser {
  clerkId: string;
  role: string;
  name?: string;
  email?: string;
  _id?: unknown;
}

export interface AppEnv {
  Variables: {
    user: AuthUser;
  };
}
