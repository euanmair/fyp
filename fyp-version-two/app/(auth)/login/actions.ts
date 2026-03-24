'use server';

// Server action for handling login authentication
// This uses jose library (same as middleware) for JWT token generation and signing

import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

// This is a placeholder - replace with your actual user database/model
interface User {
  id: string;
  email: string;
  passwordHash: string;
  // Add other user fields as needed
}

// Placeholder user database - replace with actual database query
const users: User[] = [
  {
    id: '1',
    email: 'user@example.com',
    passwordHash: 'example', // bcrypt hash for password: "Test@123"
  },
];

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
// NOTE: Always set JWT_SECRET in .env.local for security - default value is for development only

export async function loginUser(formData: FormData) {
  // AUTHENTICATION FLOW WITH JOSE & JWT:
  // 1. Client submits form from /(auth)/login/page.tsx
  // 2. This server action receives credentials
  // 3. Validates and verifies password
  // 4. Generates JWT token using jose's SignJWT
  // 5. Stores token in HTTP-only cookie (secure, cannot be accessed by JavaScript)
  // 6. Middleware will verify this token on every request
  //
  // SECURITY NOTES:
  // - JWT_SECRET is shared between signing (here) and verification (middleware)
  // - Both use jose library for consistency
  // - Token stored in HTTP-only cookie prevents XSS attacks
  // - Tokens expire in 7 days, forcing re-authentication
  
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  // Validate input
  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  // I LOVE regex
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters long' };
  }

  try {
    // Find user - replace with actual database query
    const user = users.find(u => u.email === email);

    if (!user) {
      return { error: 'Invalid email or password' };
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return { error: 'Invalid email or password' };
    }

    // Generate JWT token using jose (same library as middleware for consistency)
    // Convert JWT_SECRET string to Uint8Array format (required by jose)
    const secret = new TextEncoder().encode(JWT_SECRET);
    
    // SignJWT from jose library - async-based, modern approach
    // Steps:
    // 1. new SignJWT() - Create token builder with payload
    // 2. setProtectedHeader() - Set algorithm (HS256 = HMAC-SHA256)
    // 3. setExpirationTime() - Token expires in 7 days
    // 4. sign() - Cryptographically sign token with secret
    // Result: A JWT string like "eyJhbGc.eyJpc3N...twqeqPg"
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
    })
      .setProtectedHeader({ alg: 'HS256' }) // Algorithm for token signing
      .setExpirationTime('7d') // Token expires in 7 days
      .sign(secret);

    // Set HTTP-only cookie with JWT token
    // Cookie security options:
    // - httpOnly: true = prevents JavaScript from accessing (protects against XSS)
    // - secure: true in production = only sent over HTTPS
    // - sameSite: 'strict' = prevents CSRF attacks
    // - maxAge: 7 days = cookie expires automatically
    // - path: '/' = cookie sent with all requests
    const cookieStore = await cookies();
    cookieStore.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    // Success - redirect will happen on client side
    return { success: true };

  } catch (error) {
    console.error('Login error:', error);
    return { error: 'An error occurred during login' };
  }
}