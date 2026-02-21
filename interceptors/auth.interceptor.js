import { supabase } from "../config/supabase.js";
import { STATUS, USER_RANK, REGEX } from '../utils/constants.js';

const createErrorResponse = (field, message) => {
    return {
        success: false,
        message: "Validation Error",
        err: { [field]: message }
    };
};

const checkUserNotExists = async (req, res, next) => {
    try {
        const { email_id } = req.body;

        const { data: existingUser } = await supabase
            .from("users")
            .select("user_id")
            .eq("email_id", email_id)
            .maybeSingle();

        if (existingUser) {
            return res.status(STATUS.UNPROCESSABLE_ENTITY).json(
                createErrorResponse("email_id", "User already registered with this email.")
            );
        }

        next();

    } catch (error) {
        console.error("Middleware Error:", error);
        return res.status(500).json({
            message: "Internal Server Error",
            success: false
        });
    }
};

export const validateName = (req, res, next) => {
    if (!req.body.name) {
        return res.status(STATUS.BAD_REQUEST).json(
            createErrorResponse("name", "Name of the user not present in the request")
        );
    }

    if (req.body.name.length < 2 || req.body.name.length > 20) {
         return res.status(STATUS.BAD_REQUEST).json(
            createErrorResponse("name", "Name must be between 2 and 20 characters")
        );
    }
    next();
};

export const validateEmail = (req, res, next) => {
    if (!req.body.email_id) {
        return res.status(STATUS.BAD_REQUEST).json(
            createErrorResponse("email_id", "Email of the user not present in the request")
        );
    }

    if (!REGEX.EMAIL.test(req.body.email_id)) {
        return res.status(STATUS.BAD_REQUEST).json(
            createErrorResponse("email_id", "Invalid Email format")
        );
    }
    next();
};

export const validatePassword = (req, res, next) => {
    if (!req.body.password) {
        return res.status(STATUS.BAD_REQUEST).json(
            createErrorResponse("password", "Password is required")
        );
    }

    if (req.body.password.length < 8) {
        return res.status(STATUS.BAD_REQUEST).json(
            createErrorResponse("password", "Password must be at least 8 characters long")
        );
    }
    next();
};

export const validateCode = (req, res, next) => {
    if (!req.body.code) {
        return res.status(STATUS.BAD_REQUEST).json(
            createErrorResponse("otp", "OTP is required")
        );
    }

    if (req.body.code.length !== 4) {
        return res.status(STATUS.BAD_REQUEST).json(
            createErrorResponse("otp", "OTP must be 4 characters long")
        );
    }
    next();
};

export const validateRank = (req, res, next) => {
    if (!req.body.rank) {
        return res.status(STATUS.BAD_REQUEST).json(
            createErrorResponse("rank", "Rank is required")
        );
    }

    if (!Object.values(USER_RANK).includes(req.body.rank)) {
        return res.status(STATUS.BAD_REQUEST).json(
            createErrorResponse("rank", "User rank is invalid")
        );
    }
    next();
};

export const validateStrictBody = (allowedKeys) => {
    return (req, res, next) => {
        const receivedKeys = Object.keys(req.body);
        
        const extraKeys = receivedKeys.filter(key => !allowedKeys.includes(key));

        if (extraKeys.length > 0) {
            return res.status(STATUS.BAD_REQUEST).json(
                createErrorResponse(
                    "unexpected_fields", 
                    `Invalid Request. Unknown fields present: ${extraKeys.join(", ")}`
                )
            );
        }
        next();
    };
};

const validateSignUpRequest = [
    validateStrictBody(["name", "rank", "email_id", "password", "code"]),
    validateName,
    validateRank,
    validateEmail,
    validatePassword,
    validateCode
];

const validateSignInRequest = [
    validateStrictBody(["email_id", "password", "code"]),
    validateEmail,
    validatePassword,
    validateCode
];

export default {
    checkUserNotExists,
    validateSignUpRequest,
    validateSignInRequest
};