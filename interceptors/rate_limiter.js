import rateLimit from 'express-rate-limit'
import RedisStore from 'rate-limit-redis'
import redisClient from '../config/redis.js' 

const createLimiter = (max, windowMinutes, message) => {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rate_limit:',
    }),
    message: { status: 429, error: message }
  })
}

// Global — all routes
export const globalLimiter = createLimiter(
    100,
    15,
    "Too many requests, try again after 15 minutes"
)


export const resetPasswordLimiter = createLimiter(
    5,
    15,
    "Too many reset password request attempts, try again after 15 minutes"
)

// OTP — brute force protection
export const otpLimiter = createLimiter(
    5,
    15,
    "Too many otp request attempts, try again after 15 minutes"
)

// Signin — brute force protection
export const signinLimiter = createLimiter(
    10,
    15,
    "Too many login request attempts, try again after 15 minutes"
)

// Signup — prevent fake accounts
export const signupLimiter = createLimiter(
    5,
    15,
    "Too many signup request attempts, try again after 15 minutes"
)

// Case search — sensitive data protection
export const caseSearchLimiter = createLimiter(
    10,
    15,
    "Too many case requestattempts, try again after 15 minutes"
)


// User search — sensitive data protection
export const userSearchLimiter = createLimiter(
    10,
    15,
    "Too many user request attempts, try again after 15 minutes"
)