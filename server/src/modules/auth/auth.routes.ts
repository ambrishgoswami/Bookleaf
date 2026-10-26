import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { parse } from "../../lib/validation.js";
import { authenticate, currentUser } from "../../middleware/auth.js";
import * as authService from "./auth.service.js";
import { createAuthor } from "../authors/authors.service.js";

const LoginBody = z.object({
  email: z.email("Enter a valid email address").trim(),
  password: z.string().min(1, "Password is required").max(200),
});

// Brute-force protection for the public login and registration endpoints.
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

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const UpdateProfileBody = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100).optional(),
    phone: optionalText(30).optional(),
    city: optionalText(80).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: "Provide at least one field to update" });

authRouter.patch("/me", authenticate, async (req, res) => {
  res.json({ user: await authService.updateProfile(currentUser(req), parse(UpdateProfileBody, req.body)) });
});

export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: PasswordSchema,
});

authRouter.post("/change-password", authenticate, loginLimiter, async (req, res) => {
  const { currentPassword, newPassword } = parse(ChangePasswordBody, req.body);
  await authService.changePassword(currentUser(req).id, currentPassword, newPassword);
  res.status(204).end();
});

const RegisterBody = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.email("Enter a valid email address").trim(),
  password: PasswordSchema,
  phone: z.string().trim().max(30).nullish().transform((v) => v || null),
  city: z.string().trim().max(80).nullish().transform((v) => v || null),
});

/**
 * Author self-registration. Creates an author account (no books yet — books
 * are added by BookLeaf once a manuscript is received) and signs them in.
 * Admin accounts are never self-registered. Rate-limited like login.
 */
authRouter.post("/register", loginLimiter, async (req, res) => {
  const input = parse(RegisterBody, req.body);
  await createAuthor(input);
  res.status(201).json(await authService.login(input.email, input.password));
});
