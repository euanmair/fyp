'use server';

// Server action for handling login authentication
// This uses jose library (same as middleware) for JWT token generation and signing

import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { createHash, randomUUID } from 'crypto';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt?: string;
  resetTokenHash?: string;
  resetTokenExpiresAt?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'NurseryUsers';
const AWS_REGION = process.env.AWS_REGION || 'eu-north-1';
const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
// NOTE: Always set JWT_SECRET in .env.local for security - default value is for development only

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

async function getUserByEmail(email: string): Promise<User | null> {
  const normalisedEmail = normaliseEmail(email);
  const response = await dynamoClient.send(
    new GetItemCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        email: { S: normalisedEmail },
      },
    })
  );

  if (!response.Item) return null;

  const id = response.Item.id?.S;
  const storedEmail = response.Item.email?.S;
  const passwordHash = response.Item.passwordHash?.S;
  const createdAt = response.Item.createdAt?.S;
  const resetTokenHash = response.Item.resetTokenHash?.S;
  const resetTokenExpiresAt = response.Item.resetTokenExpiresAt?.S;

  if (!id || !storedEmail || !passwordHash) {
    throw new Error('User record is malformed in DynamoDB.');
  }

  return {
    id,
    email: storedEmail,
    passwordHash,
    createdAt,
    resetTokenHash,
    resetTokenExpiresAt,
  };
}

async function saveUser(user: User) {
  const item: Record<string, { S: string }> = {
    email: { S: user.email },
    id: { S: user.id },
    passwordHash: { S: user.passwordHash },
    createdAt: { S: user.createdAt || new Date().toISOString() },
  };

  if (user.resetTokenHash) {
    item.resetTokenHash = { S: user.resetTokenHash };
  }

  if (user.resetTokenExpiresAt) {
    item.resetTokenExpiresAt = { S: user.resetTokenExpiresAt };
  }

  await dynamoClient.send(
    new PutItemCommand({
      TableName: USERS_TABLE_NAME,
      Item: item,
    })
  );
}

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function setAuthCookie(user: { id: string; email: string }) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

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
  
  const email = normaliseEmail(formData.get('email') as string);
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
    // Find user from DynamoDB
    const user = await getUserByEmail(email);

    if (!user) {
      return { error: 'Invalid email or password' };
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return { error: 'Invalid email or password' };
    }

    await setAuthCookie({ id: user.id, email: user.email });

    // Success - redirect will happen on client side
    return { success: true };

  } catch (error) {
    console.error('Login error:', error);
    return { error: 'An error occurred during login' };
  }
}

export async function registerUser(formData: FormData) {
  const email = normaliseEmail(formData.get('email') as string);
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!email || !password || !confirmPassword) {
    return { error: 'Email, password and confirm password are required' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters long' };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' };
  }

  try {
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return { error: 'An account with this email already exists' };
    }

    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const createdAt = new Date().toISOString();

    await dynamoClient.send(
      new PutItemCommand({
        TableName: USERS_TABLE_NAME,
        Item: {
          email: { S: email },
          id: { S: userId },
          passwordHash: { S: passwordHash },
          createdAt: { S: createdAt },
        },
        ConditionExpression: 'attribute_not_exists(email)',
      })
    );

    await setAuthCookie({ id: userId, email });

    return { success: true, message: 'Account created successfully' };
  } catch (error) {
    console.error('Registration error:', error);
    return { error: 'An error occurred during registration' };
  }
}

export async function requestPasswordReset(formData: FormData) {
  const email = normaliseEmail(formData.get('email') as string);

  if (!email) {
    return { error: 'Email is required' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address' };
  }

  try {
    const user = await getUserByEmail(email);

    // Avoid account enumeration: respond with success even if the account is not found.
    if (!user) {
      return { success: true, message: 'If the email exists, a reset code has been generated.' };
    }

    const resetToken = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const resetTokenHash = hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await saveUser({
      ...user,
      resetTokenHash,
      resetTokenExpiresAt: expiresAt,
    });

    // In production, the token should be sent by email/SMS rather than returned.
    const developmentCode = process.env.NODE_ENV !== 'production' ? resetToken : undefined;

    return {
      success: true,
      message: 'If the email exists, a reset code has been generated.',
      developmentCode,
      expiresAt,
    };
  } catch (error) {
    console.error('Request password reset error:', error);
    return { error: 'Unable to start password reset flow' };
  }
}

export async function resetPassword(formData: FormData) {
  const email = normaliseEmail(formData.get('email') as string);
  const code = String(formData.get('code') || '').trim().toUpperCase();
  const newPassword = String(formData.get('newPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  if (!email || !code || !newPassword || !confirmPassword) {
    return { error: 'Email, reset code, new password and confirm password are required' };
  }

  if (newPassword.length < 8) {
    return { error: 'Password must be at least 8 characters long' };
  }

  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match' };
  }

  try {
    const user = await getUserByEmail(email);
    if (!user || !user.resetTokenHash || !user.resetTokenExpiresAt) {
      return { error: 'Invalid or expired reset code' };
    }

    const expiresAtMs = new Date(user.resetTokenExpiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
      return { error: 'Invalid or expired reset code' };
    }

    if (hashResetToken(code) !== user.resetTokenHash) {
      return { error: 'Invalid or expired reset code' };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await saveUser({
      ...user,
      passwordHash,
      resetTokenHash: undefined,
      resetTokenExpiresAt: undefined,
    });

    return { success: true, message: 'Password updated successfully. You can now sign in.' };
  } catch (error) {
    console.error('Reset password error:', error);
    return { error: 'Unable to reset password at this time' };
  }
}