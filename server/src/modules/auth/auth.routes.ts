import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { parse } from "../../lib/validation.js";
import { authenticate, currentUser } from "../../middleware/auth.js";
import * as authService from "./auth.service.js";

const LoginBody = z.object({
  email: z.email("Enter a valid email address").trim(),
  password: z.string().min(1, "Password is required").max(200),
});

// Brute-force protection on the only unauthenticated write endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again in 15 minutes." } },
});

export const authRouter = Router();

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = parse(LoginBody, req.body);
  res.json(await authService.login(email, password));
});

authRouter.get("/me", authenticate, async (req, res) => {
  res.json({ user: await authService.getProfile(currentUser(req).id) });
});
