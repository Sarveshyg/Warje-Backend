import { supabase } from "../supabase.js";

import { STATUS, REGEX, USER_RANK, USER_ROLE } from '../utils/constants.js';
import { errorResponseBody } from "../utils/responseBody.js";
import { validateCode, validateEmail, validatePassword, validateStrictBody, validateName } from "./auth.interceptor.js";

export const isUser = async (data) => {
    try {
        const email = data.email_id;
        const userId = data.user_id;

        let query = supabase.from("users").select("user_id");

        if (email) {
            query = query.eq("email_id", email);
        } else if (userId) {
            query = query.eq("user_id", userId);
        } else {
            throw {
                message: "Validation Error",
                err: { details: "No email_id or user_id provided to check user existence." },
                code: STATUS.NOT_FOUND
            }
        }

        const { data: user, error } = await query.maybeSingle();

        if (error) throw error;

        if (!user) {
            throw {
                message: "User Not Found",
                err: { "user_id": "The user with the provided credentials does not exist in our records." },
                code: STATUS.NOT_FOUND
            }
        }

        return true;

    } catch (error) {
        console.error("isUser Middleware Error:", error);
        if (error.code) {
            throw error;
        }

        throw {
            message: "Internal Server Error",
            err: { details: error.message },
            code: STATUS.INTERNAL_SERVER_ERROR
        }
    }
};

const validateOtpReq = (req, res, next) => {
    const { purpose } = req.body;

    const rules = {
        SIGNUP: {
            allowedKeys: ["name", "email_id", "purpose"],
            validators: [validateName, validateEmail]
        },
        SIGNIN: {
            allowedKeys: ["email_id", "purpose"],
            validators: [validateEmail]
        },
        RESET_PASSWORD: {
            allowedKeys: ["email_id", "purpose"],
            validators: [validateEmail]
        }
    };

    const selectedRule = rules[purpose];

    if (!selectedRule) {
        return res.status(STATUS.BAD_REQUEST).json({
            success: false,
            message: "Validation Error",
            err: { purpose: "Invalid or missing purpose. Must be SIGNUP, SIGNIN, or RESET_PASSWORD" }
        });
    }

    const receivedKeys = Object.keys(req.body);
    const extraKeys = receivedKeys.filter(key => !selectedRule.allowedKeys.includes(key));

    if (extraKeys.length > 0) {
        return res.status(STATUS.BAD_REQUEST).json({
            success: false,
            message: "Validation Error",
            err: { unexpected_fields: `Invalid Request. Unknown fields: ${extraKeys.join(", ")}` }
        });
    }

    const runValidators = (index) => {
        if (index >= selectedRule.validators.length) {
            return next();
        }

        const currentValidator = selectedRule.validators[index];

        currentValidator(req, res, (err) => {
            if (err) return next(err);
            runValidators(index + 1);
        });
    };

    runValidators(0);
};

const validateRole = async (req, res, next) => {
    const currentUser = req.user;

    const user_id = req.params.id;

    if (!user_id) {
        const response = { ...errorResponseBody };
        response.err = { user_id: "User ID is required." };
        response.message = "Validation Error";
        return res.status(STATUS.BAD_REQUEST).json(response);
    }

    if (String(user_id) === String(currentUser.user_id)) {
        const response = { ...errorResponseBody };
        response.message = "Operation Failed: You cannot change your own role.";
        response.err = { user_id: "Self-modification is not allowed." };

        return res.status(STATUS.FORBIDDEN).json(response);
    }

    try {
        await isAdmin({ user_id: currentUser.user_id });

        next();
    }
    catch (error) {
        if (error.code) {
            const response = { ...errorResponseBody };
            response.message = error.message;
            response.err = error.err;
            return res.status(error.code).json(response);
        }
        const response = { ...errorResponseBody };
        response.message = "Something went wrong.";
        return res.status(STATUS.BAD_REQUEST).json(response);
    }
}

const validateUserVerified = async (req, res, next) => {
    const currentUser = req.user;
    const user_id = req.params.id;

    if (!user_id) {
        const response = { ...errorResponseBody };
        response.err = { user_id: "User ID is required." };
        response.message = "Validation Error";
        return res.status(STATUS.BAD_REQUEST).json(response);
    }

    if (String(user_id) === String(currentUser.user_id)) {
        const response = { ...errorResponseBody };
        response.message = "Operation Failed: You cannot change your own role.";
        response.err = { user_id: "Self-modification is not allowed." };

        return res.status(STATUS.FORBIDDEN).json(response);
    }

    try {
        await isAdmin({ user_id: currentUser.user_id });

        next();
    }
    catch (error) {
        if (error.code) {
            const response = { ...errorResponseBody };
            response.message = error.message;
            response.err = error.err;
            return res.status(error.code).json(response);
        }

        console.log("Verification Middleware Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Internal server error during verification validation.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const validateGetUsers = async (req, res, next) => {
    const currentUser = req.user;

    try {
        await isAdmin({ user_id: currentUser.user_id });
        next();

    } catch (error) {
        if (error.code) {
            const response = { ...errorResponseBody };
            response.message = error.message;
            response.err = error.err;
            return res.status(error.code).json(response);
        }

        console.log("Verification Middleware Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Internal server error during verification validation.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const validateGetUnverifiedUsers = async (req, res, next) => {
    const currentUser = req.user;

    try {
        await isAdmin({ user_id: currentUser.user_id });
        next();

    } catch (error) {
        if (error.code) {
            const response = { ...errorResponseBody };
            response.message = error.message;
            response.err = error.err;
            return res.status(error.code).json(response);
        }

        console.log("Verification Middleware Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Internal server error during verification validation.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const validateUserUpdate = (req, res, next) => {
    try {
        const user_id = req.params.id;

        if (!user_id) {
            const response = { ...errorResponseBody };
            response.err = { user_id: "User ID is required for updates." };
            response.message = "Validation Error";
            return res.status(STATUS.BAD_REQUEST).json(response);
        }

        const { name, rank, email_id, password } = req.body;

        const ALLOWED_FIELDS = ["name", "rank", "email_id", "password"];
        const receivedKeys = Object.keys(req.body);
        const extraKeys = receivedKeys.filter(key => !ALLOWED_FIELDS.includes(key));

        if (extraKeys.length > 0) {
            const response = { ...errorResponseBody };
            response.err = { unexpected_fields: `Unknown fields: ${extraKeys.join(", ")}` };
            response.message = "Invalid Request Body";
            return res.status(STATUS.BAD_REQUEST).json(response);
        }

        if (receivedKeys.length === 0) {
            const response = { ...errorResponseBody };
            response.message = "No fields provided to update.";
            return res.status(STATUS.BAD_REQUEST).json(response);
        }

        if (name !== undefined) {
            if (name.trim().length < 2 || name.trim().length > 20) {
                const response = { ...errorResponseBody };
                response.err = { name: "Name must be between 2 and 20 characters." };
                return res.status(STATUS.BAD_REQUEST).json(response);
            }
        }

        if (rank !== undefined) {
            if (!Object.values(USER_RANK).includes(rank)) {
                const response = { ...errorResponseBody };
                response.err = { rank: `Invalid rank. Allowed: ${Object.values(USER_RANK).join(', ')}` };
                return res.status(STATUS.BAD_REQUEST).json(response);
            }
        }

        if (email_id !== undefined) {
            if (!REGEX.EMAIL.test(email_id)) {
                const response = { ...errorResponseBody };
                response.err = { email_id: "Invalid email format." };
                return res.status(STATUS.BAD_REQUEST).json(response);
            }
        }

        if (password !== undefined) {
            if (password.length < 8) {
                const response = { ...errorResponseBody };
                response.err = { password: "Password must be at least 8 characters." };
                return res.status(STATUS.BAD_REQUEST).json(response);
            }
        }

        req.updates = {};
        if (name) req.updates.name = name;
        if (rank) req.updates.rank = rank;
        if (email_id) req.updates.email_id = email_id;
        if (password) req.updates.password = password;

        next();

    } catch (error) {
        console.error("Validation Error:", error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ message: "Server Error" });
    }
};

const isNotTempUser = async (data) => {
    console.log(data);
    const { email_id } = data;

    const { data: tempUser, error } = await supabase
        .from("temp_users")
        .select("name")
        .eq("email_id", email_id)
        .maybeSingle();

    // Supabase unexpected error
    if (error && error.code !== "PGRST116") {
        console.log(error)
        throw {
            code: STATUS.INTERNAL_SERVER_ERROR,
            message: "Database error",
            error
        };
    }

    // User exists in temp_users
    if (tempUser) {
        console.log(tempUser)
        throw {
            code: STATUS.FORBIDDEN,
            message: "User registration is pending admin approval. You cannot login or signup again yet."
        };
    }

    // Not a temp user → allow flow
    return true;
};

export const isAdmin = async (data) => {
    try {
        const { user_id } = data;

        const { data: user } = await supabase
            .from("users")
            .select("role")
            .eq("user_id", user_id)
            .single()
            .throwOnError();

        if (user && user.role !== USER_ROLE.ADMIN) {
            throw {
                code: STATUS.FORBIDDEN,
                message: "Access denied. Admin privileges required.",
                err: { role: "Insufficient permissions" }
            }
        }
        return true;

    } catch (error) {
        console.log("Is admin error: ", error);
        if (error.code === 'PGRST116') {
            throw {
                code: STATUS.NOT_FOUND,
                err: { email_id: "User not found. Please sign up." },
                message: "Authentication Failed"
            };
        }

        throw error;
    }
}

const validateUserDeletion = async (req, res, next) => {
    const currentUser = req.user;
    const user_id = req.params.id;

    if (!user_id) {
        errorResponseBody.err = { user_id: "User ID is required." };
        errorResponseBody.message = "Validation Error";
        return res.status(STATUS.BAD_REQUEST).json(errorResponseBody);
    }

    const isSamePerson = currentUser.user_id === user_id;

    try {
        if (!isSamePerson) {
            await isAdmin({ user_id: currentUser.user_id });
        }

        next();

    } catch (error) {
        if (error.code) {
            const response = { ...errorResponseBody };
            response.message = error.message;
            response.err = error.err;
            return res.status(error.code).json(response);
        }
        const response = { ...errorResponseBody };
        response.message = "Something went wrong.";
        return res.status(STATUS.BAD_REQUEST).json(response);
    }
};

const validateUpdateDeleted = async (req, res, next) => {
    const currentUser = req.user;
    const user_id = req.params.id;

    if (!user_id) {
        errorResponseBody.err = { user_id: "User ID is required." };
        errorResponseBody.message = "Validation Error";
        return res.status(STATUS.BAD_REQUEST).json(errorResponseBody);
    }

    const isSamePerson = currentUser.user_id === user_id;

    try {
        if (isSamePerson) {
            throw {
                message: "Access Denied. You are not authorized to deactivate another user's account.",
                code: STATUS.FORBIDDEN
            }
        }

        await isAdmin({ user_id: currentUser.user_id });
        next();

    } catch (error) {
        if (error.code) {
            const response = { ...errorResponseBody };
            response.message = error.message;
            response.err = error.err;
            return res.status(error.code).json(response);
        }
        const response = { ...errorResponseBody };
        response.message = "Something went wrong.";
        return res.status(STATUS.BAD_REQUEST).json(response);
    }
};

const validateResetPass = [
    validateStrictBody(["email_id", "password", "code"]),
    validateEmail,
    validatePassword,
    validateCode
];

export default {
    validateOtpReq,
    validateRole,
    validateUserVerified,
    validateGetUsers,
    validateGetUnverifiedUsers,
    validateUserUpdate,
    validateUserDeletion,
    validateResetPass,
    isNotTempUser,
    validateUpdateDeleted
}
