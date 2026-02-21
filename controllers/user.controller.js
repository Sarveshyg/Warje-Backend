import { supabase } from "../config/supabase.js"
import bcrypt, { hash } from "bcryptjs"

import { STATUS, USER_ROLE } from "../utils/constants.js"
import { successResponseBody, errorResponseBody } from "../utils/responseBody.js"
import userService from "../services/user.service.js"
import { checkOTPExistence } from "../services/auth.service.js"

const sendOTP = async (req, res) => {
    try {
        const data = req.body;

        const response = await userService.sendOtpService(data);
        console.log("RESPONSE: ", response)

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.log("OTP Controller Error:", error);

        if (error.code) {
            errorResponseBody.message = error.message;
            errorResponseBody.err = error.err;
            return res.status(error.code).json(errorResponseBody)
        }

        errorResponseBody.message = "Something went wrong.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(errorResponseBody);
    }
}

const changeRole = async (req, res) => {
    const user_id = req.params.id;

    try {
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('role')
            .eq('user_id', user_id)
            .single();

        if (fetchError) throw fetchError;

        let new_role;
        if (user.role === USER_ROLE.ADMIN)
            new_role = USER_ROLE.NORMAL_USER;
        else
            new_role = USER_ROLE.ADMIN;


        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({ role: new_role })
            .eq('user_id', user_id)
            .select('email_id, role')
            .single();

        if (updateError) throw updateError;

        const response = { ...successResponseBody };
        response.message = "User role updated successfully.";
        response.data = updatedUser;

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error('Role error', error);

        const errorResponse = { ...errorResponseBody };

        if (error.code === 'PGRST116') {
            errorResponse.err = { user_id: "User not found." };
            errorResponse.code = STATUS.NOT_FOUND;
            errorResponse.message = "Operation Failed";
            return res.status(STATUS.NOT_FOUND).json(errorResponse);
        }

        errorResponse.message = "Internal server error while changing role.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(errorResponse);
    }
}

const makeUserVerified = async (req, res) => {
    const temp_user_id = req.params.id;

    try {
        const { data: tempUser } = await supabase
            .from("temp_users")
            .select("name, rank, password, email_id")
            .eq("temp_user_id", temp_user_id)
            .single()
            .throwOnError();

        const { data: user } = await supabase
            .from("users")
            .insert([{
                name: tempUser.name,
                rank: tempUser.rank,
                email_id: tempUser.email_id,
                password: tempUser.password
            }])
            .select("role")
            .single()
            .throwOnError();

        await supabase
            .from("temp_users")
            .delete()
            .eq("temp_user_id", temp_user_id)
            .throwOnError();

        delete tempUser.password;

        const user_data = {
            name: tempUser.name,
            email_id: tempUser.email_id,
            rank: tempUser.rank,
            role: user.role
        }

        const response = { ...successResponseBody };
        response.data = user_data;
        response.message = "User has been verified successfully.";
        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Verification error: ", error);

        const errorResponse = { ...errorResponseBody };

        if (error.code === 'PGRST116') {
            errorResponse.err = { user_id: "Temporary user not found." };
            errorResponse.code = STATUS.NOT_FOUND;
            errorResponse.message = "Verification Failed";
            return res.status(STATUS.NOT_FOUND).json(errorResponse);
        }

        if (error.code === '23505') {
            errorResponse.err = { email_id: "This user is already verified." };
            errorResponse.message = "Duplicate Entry";
            return res.status(STATUS.CONFLICT).json(errorResponse);
        }

        errorResponse.message = "Internal server error during verification.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(errorResponse);
    }
}

const getUsers = async (req, res) => {
    const targetUserId = req.query.id;
    try {
        let query = supabase
            .from('users')
            .select('user_id, name, email_id, role, rank')

        if (targetUserId) {
            query = query.eq('user_id', targetUserId);
        }

        query.eq("is_deleted", false);

        const { data: users, error } = await query;

        if (error) throw error;

        if (targetUserId && users.length > 0) {
            return res.status(STATUS.OK).json({
                success: true,
                data: users[0]
            });
        }

        return res.status(STATUS.OK).json({
            success: true,
            data: users
        });
    }
    catch (error) {
        console.log("Get Users Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Failed to fetch users.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const getUnverifiedUser = async (req, res) => {
    const targetUserId = req.query.id;
    try {
        let query = supabase
            .from('temp_users')
            .select('temp_user_id, name, email_id, rank')

        if (targetUserId) {
            query = query.eq('temp_user_id', targetUserId);
        }

        const { data: users, error } = await query;

        if (error) throw error;

        if (targetUserId && users.length > 0) {
            return res.status(STATUS.OK).json({
                success: true,
                data: users[0]
            });
        }

        return res.status(STATUS.OK).json({
            success: true,
            data: users
        });
    }
    catch (error) {
        console.log("Get Users Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Failed to fetch users.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const updateUser = async (req, res) => {
    try {
        const data = req.body;
        const user_id = req.params.id;

        const result = await userService.updateUserService(data, user_id);

        successResponseBody.data = result;
        successResponseBody.message = "User updated successfully.";

        return res.status(STATUS.OK).json(successResponseBody);

    } catch (error) {
        console.error("Update user Controller Error:", error);

        if (error.code) {
            return res.status(error.code).json(error);
        }

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: "Something went wrong.",
            success: false
        });
    }
}

const resetPassword = async (req, res) => {
    try {
        const { email_id, code, password } = req.body;

        await checkOTPExistence({ email_id, code });

        const hashedPassword = await bcrypt.hash(password, 10);

        const { data: updatedUser } = await supabase
            .from("users")
            .update({ password: hashedPassword })
            .eq("email_id", email_id)
            .select("user_id, email_id")
            .single()
            .throwOnError();

        successResponseBody.message = "Password reset successfully. You can now login.";
        successResponseBody.data = { email_id: updatedUser.email_id };

        return res.status(STATUS.OK).json(successResponseBody);
    } catch (error) {
        console.error("Reset Password Controller Error:", error);

        if (error.code === 'PGRST116') {
            errorResponseBody.err = { email_id: "User with this email does not exist." };
            errorResponseBody.message = "Validation error";
            return res.status(STATUS.NOT_FOUND).json(errorResponseBody);
        }

        if (error.code === '23514') {
            if (error.message.includes("t_users_password_check")) {
                errorResponseBody.err = { password: "Password must be at least 8 characters." };
                errorResponseBody.message = "Validation error";
                return res.status(STATUS.UNPROCESSABLE_ENTITY.code).json(errorResponseBody);
            }
        }

        if (error.code) {
            errorResponseBody.err = error.err;
            errorResponseBody.message = error.message;
            return res.status(error.code).json(errorResponseBody);
        }
        errorResponseBody.err = error;
        errorResponseBody.message = "Something went wrong.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(errorResponseBody);
    }
}

const deleteUser = async (req, res) => {
    try {
        const user_id = req.params.id;

        const { } = await supabase
            .from("users")
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq("user_id", user_id)
            .throwOnError();

        const response = { ...successResponseBody };
        response.message = "User account deactivated successfully.";

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Delete User Error:", error);

        if (error.code === 'PGRST116') {
            errorResponseBody.err = { email_id: "User not found. Please sign up." };
            errorResponseBody.message = "Authentication Failed";
            return res.status(STATUS.NOT_FOUND).json(errorResponseBody);
        }

        errorResponseBody.message = "Internal server error during user deletion.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(errorResponseBody);
    }
};

const updateIsDeleted = async (req, res) => {
    try {
        const user_id = req.params.id;

        const { } = await supabase
            .from("users")
            .update({ is_deleted: false, deleted_at: null })
            .eq("user_id", user_id)
            .throwOnError();

        const response = { ...successResponseBody };
        response.message = "User account activated successfully.";

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("UpdateisDelete User Error:", error);

        if (error.code === 'PGRST116') {
            errorResponseBody.err = { email_id: "User not found. Please sign up." };
            errorResponseBody.message = "Authentication Failed";
            return res.status(STATUS.NOT_FOUND).json(errorResponseBody);
        }

        errorResponseBody.message = "Internal server error during user deletion.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(errorResponseBody);
    }
};

const isAdmin = async (req, res) => {
    const user_id = req.params.user_id;
    try {
        const { data: user } = await supabase
            .from("users")
            .select("role")
            .eq("user_id", user_id)
            .single()
            .throwOnError();

        if (user && user.role !== USER_ROLE.ADMIN) {
            errorResponseBody.message = "Access denied. Admin privileges required.";
            errorResponseBody.err = { role: "Insufficient permissions" };
            return res.status(STATUS.FORBIDDEN).json(errorResponseBody);
        }
        const response = { ...successResponseBody };
        response.message = "User has ADMIN privileges";

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.log("Is admin error: ", error);
        if (error.code === 'PGRST116') {
            errorResponseBody.message = "Access denied. Admin privileges required.";
            errorResponseBody.err = { email_id: "User not found. Please sign up." };
            errorResponseBody.message = "Authentication Failed";
            return res.status(STATUS.NOT_FOUND).json(errorResponseBody);
        }

        errorResponseBody.message = "Something went wrong.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(errorResponseBody);
    }
}

export default {
    sendOTP,
    changeRole,
    makeUserVerified,
    getUsers,
    getUnverifiedUser,
    updateUser,
    deleteUser,
    resetPassword,
    updateIsDeleted,
    isAdmin
};
