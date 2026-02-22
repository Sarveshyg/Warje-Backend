import express from "express"

import authInterceptor from "../interceptors/auth.interceptor.js";
import authController from "../controllers/auth.controller.js";
import { signinLimiter, signupLimiter } from "../interceptors/rate_limiter.js";

const router = express.Router()

router.post(
    "/signout",
    authController.signout
);

router.post(
    "/signup", 
    // signupLimiter,
    authInterceptor.checkUserNotExists,
    authInterceptor.validateSignUpRequest,
    authController.signup
);

router.post(
    "/signin", 
    // signinLimiter,
    authInterceptor.validateSignInRequest, 
    authController.signin
);

export default router