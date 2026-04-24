'use server';

// Server action for handling login authentication
// This uses jose library (same as middleware) for JWT token generation and signing

import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { randomUUID } from 'crypto';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { getSessionClaimsFromCookies, type AccountRole } from '@/lib/auth';

interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: AccountRole;
  organisationID?: string;
  staffID?: string;
  createdAt?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'NurseryUsers';
const AWS_REGION = process.env.AWS_REGION || 'eu-north-1';
const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
// NOTE: Always set JWT_SECRET in .env.local for security - default value is for development only

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

function normaliseOptionalText(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normaliseRole(value: string | null | undefined): AccountRole {
  const role = String(value || 'staff').trim().toLowerCase();
  if (role === 'admin') return 'admin';
  if (role === 'manager') return 'manager';
  return 'staff';
}

function isSafeIdentifier(value: string) {
  return /^[a-zA-Z0-9._-]{2,64}$/.test(value);
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
  const role = response.Item.role?.S;
  const organisationID = response.Item.organisationID?.S;
  const staffID = response.Item.staffID?.S;

  if (!id || !storedEmail || !passwordHash) {
    throw new Error('User record is malformed in DynamoDB.');
  }

  return {
    id,
    email: storedEmail,
    passwordHash,
    role: role === 'admin' ? 'admin' : role === 'manager' ? 'manager' : 'staff',
    organisationID,
    staffID,
    createdAt,
  };
}

async function saveUser(user: User) {
  const item: Record<string, { S: string }> = {
    email: { S: user.email },
    id: { S: user.id },
    passwordHash: { S: user.passwordHash },
    role: { S: user.role || 'staff' },
    createdAt: { S: user.createdAt || new Date().toISOString() },
  };

  if (user.organisationID) {
    item.organisationID = { S: user.organisationID };
  }

  if (user.staffID) {
    item.staffID = { S: user.staffID };
  }

  await dynamoClient.send(
    new PutItemCommand({
      TableName: USERS_TABLE_NAME,
      Item: item,
    })
  );
}

async function setAuthCookie(user: { id: string; email: string; role: AccountRole; organisationID?: string; staffID?: string }) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    role: user.role,
    organisationID: user.organisationID || null,
    staffID: user.staffID || null,
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

    await setAuthCookie({
      id: user.id,
      email: user.email,
      role: user.role,
      organisationID: user.organisationID,
      staffID: user.staffID,
    });

    // Success - redirect will happen on client side
    return { success: true };

  } catch (error) {
    console.error('Login error:', error);
    return { error: 'An error occurred during login' };
  }
}

export async function registerUser(formData: FormData) {
  const inviteCode = (formData.get('inviteCode') as string || '').trim();
  const expectedCode = process.env.INVITE_CODE || '';
  if (!inviteCode || inviteCode !== expectedCode) {
    return { error: 'Invalid invitation code.' };
  }

  const email = normaliseEmail(formData.get('email') as string);
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const role = normaliseRole(formData.get('role') as string);
  const organisationID = normaliseOptionalText(formData.get('organisationID') as string);
  const staffID = normaliseOptionalText(formData.get('staffID') as string);

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

  if (organisationID && !isSafeIdentifier(organisationID)) {
    return { error: 'Organisation ID must be 2-64 characters and use letters, numbers, dot, underscore or hyphen.' };
  }

  if (staffID && !isSafeIdentifier(staffID)) {
    return { error: 'Staff ID must be 2-64 characters and use letters, numbers, dot, underscore or hyphen.' };
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
          role: { S: role },
          createdAt: { S: createdAt },
          ...(organisationID ? { organisationID: { S: organisationID } } : {}),
          ...(staffID ? { staffID: { S: staffID } } : {}),
        },
        ConditionExpression: 'attribute_not_exists(email)',
      })
    );

    await setAuthCookie({ id: userId, email, role, organisationID, staffID });

    return { success: true, message: 'Account created successfully' };
  } catch (error) {
    console.error('Registration error:', error);
    return { error: 'An error occurred during registration' };
  }
}

export async function joinOrganisation(formData: FormData) {
  const session = await getSessionClaimsFromCookies();
  if (!session?.email) {
    return { error: 'You must be signed in to join an organisation.' };
  }

  const organisationID = normaliseOptionalText(formData.get('organisationID') as string);
  const staffID = normaliseOptionalText(formData.get('staffID') as string);

  if (!organisationID) {
    return { error: 'Organisation ID is required.' };
  }

  if (!isSafeIdentifier(organisationID)) {
    return { error: 'Organisation ID must be 2-64 characters and use letters, numbers, dot, underscore or hyphen.' };
  }

  if (staffID && !isSafeIdentifier(staffID)) {
    return { error: 'Staff ID must be 2-64 characters and use letters, numbers, dot, underscore or hyphen.' };
  }

  try {
    const user = await getUserByEmail(session.email);
    if (!user) {
      return { error: 'Account not found.' };
    }

    const nextUser: User = {
      ...user,
      organisationID,
      staffID: staffID || user.staffID,
    };

    await saveUser(nextUser);

    await setAuthCookie({
      id: nextUser.id,
      email: nextUser.email,
      role: nextUser.role,
      organisationID: nextUser.organisationID,
      staffID: nextUser.staffID,
    });

    return { success: true, message: 'Organisation updated successfully.' };
  } catch (error) {
    console.error('Join organisation error:', error);
    return { error: 'Unable to join organisation at this time.' };
  }
}