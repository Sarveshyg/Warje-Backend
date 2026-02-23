import express from "express"

import userController from "../controllers/user.controller.js"
import userIntercetor from "../interceptors/user.interceptor.js"
import { verifyToken } from "../interceptors/verifyToken.js"
import { checkTokenRefresh } from "../interceptors/checkTokenRefresh.js"
import { validateStrictBody } from "../interceptors/auth.interceptor.js"
import { userSearchLimiter, otpLimiter, resetPasswordLimiter } from "../interceptors/rate_limiter.js"

const router = express.Router()

/*
SIGNUP: allowedKeys: ["name", "email_id", "purpose"],
SIGNIN: allowedKeys: ["email_id", "purpose"],
RESET_PASSWORD: allowedKeys: ["email_id", "purpose"],
*/

router.post(
    "/send-otp",
    // otpLimiter,
    userIntercetor.validateOtpReq,
    userController.sendOTP
);

// {email_id, password, code}
router.patch(
    "/reset",
    // resetPasswordLimiter,
    validateStrictBody(["email_id", "password", "code"]),
    userIntercetor.validateResetPass,
    userController.resetPassword
);

router.use(verifyToken);
router.use(checkTokenRefresh);

// {}
router.get(
    "/",
    // userSearchLimiter,
    validateStrictBody([""]),
    userController.getUsers
);

// to check if user has admin privileges
router.get(
    "/admin/:user_id",
    // userSearchLimiter,
    validateStrictBody([""]),
    userController.isAdmin
);

//{ name, rank, password }
router.patch(
    "/:id",
    // userSearchLimiter,
    userIntercetor.validateUserUpdate,
    userController.updateUser
);

router.delete(
    "/:id",
    // userSearchLimiter,
    validateStrictBody([""]),
    userIntercetor.validateUserDeletion,
    userController.deleteUser
);


// to get all deleted users
router.get(
    "/deleted-users",
    // userSearchLimiter,
    validateStrictBody([""]),
    userIntercetor.getDeletedUserVerification,
    userController.getDeletedUsers,
);

// update delete user
router.patch(
    "/:id/status",
    // userSearchLimiter,
    validateStrictBody([""]),
    userIntercetor.updateDeletedUserValidate,
    userController.updateDeleletedUser
);

// to change role
router.patch(
    "/:id/role",
    // userSearchLimiter,
    validateStrictBody([""]),
    userIntercetor.validateRole,
    userController.changeRole
);

// to make user verified
router.patch(
    "/:id/verified",
    // userSearchLimiter,
    validateStrictBody([""]),
    userIntercetor.validateUserVerified,
    userController.makeUserVerified
);

// to get all users which are not verified
router.get(
    "/unverified",
    // userSearchLimiter,
    validateStrictBody([""]),
    userIntercetor.validateGetUnverifiedUsers,
    userController.getUnverifiedUser
)


export default router
