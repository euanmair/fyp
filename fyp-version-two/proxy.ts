// Import NextRequest and NextResponse from Next.js server module for proxy handling
import { NextRequest, NextResponse } from "next/server";

// Import jwtVerify from jose library for JWT token verification
import { jwtVerify } from "jose";

const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Helper function to extract and verify JWT token from request cookies
// Returns the token payload if valid, or null if token doesn't exist or is invalid
async function getToken(request: NextRequest) {
  // Extract the "auth-token" cookie value from the request
  const cookie = request.cookies.get("auth-token")?.value;
  
  // Return null if no cookie exists
  if (!cookie) return null;
  
  try {
    // Convert JWT_SECRET environment variable to Uint8Array format required by jose
    const secret = new TextEncoder().encode(jwtSecret);
    
    // Verify the JWT token using the secret - will throw error if invalid or expired
    const { payload } = await jwtVerify(cookie, secret);
    
    // Return the decoded payload containing user data (userId, email, etc.)
    return payload;
  } catch {
    // If verification fails (invalid signature, expired, etc.), return null
    return null;
  }
}

// Main proxy function that runs on every request to protected routes
// Handles authentication logic and route protection
export async function proxy(request: NextRequest) {
  // Get the JWT token from cookies and verify it
  const token = await getToken(request);

  // Check if the current request is for the login page
  const isAuthPage = request.nextUrl.pathname.startsWith("/login");

  // If user IS logged in and tries to access login page, redirect to dashboard
  // This prevents authenticated users from seeing the login page
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const pathname = request.nextUrl.pathname;

  // Check if the current request is for a protected route.
  const isProtectedRoute = pathname.startsWith("/dashboard")
    || pathname.startsWith("/admin")
    || pathname.startsWith("/staff")
    || pathname.startsWith("/join-organisation");

  // If user is NOT logged in and tries to access protected route, redirect to login
  // This enforces authentication requirement for dashboard
  if (!token && isProtectedRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!token) {
    return NextResponse.next();
  }

  const role = String(token.role || "staff").toLowerCase();
  const organisationID = token.organisationID ? String(token.organisationID) : "";

  // Staff accounts should only view their rota by default.
  if (pathname.startsWith("/dashboard") && role === "staff") {
    return NextResponse.redirect(new URL("/staff", request.url));
  }

  // Admin-only area.
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Managers and admins should belong to an organisation before rota operations.
  if (!organisationID && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/join-organisation", request.url));
  }

  // If none of the redirect conditions are met, allow request to proceed normally
  return NextResponse.next();
}

// Configuration object that specifies which routes the proxy should run on
// Uses regex pattern to match all routes EXCEPT api routes, Next.js internal resources, and favicon
export const config = {
  // Matcher pattern that excludes:
  // - /api/* (API routes don't need auth proxy)
  // - /_next/static/* (Static Next.js assets)
  // - /_next/image/* (Next.js image optimization)
  // - /favicon.ico (Favicon request)
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};