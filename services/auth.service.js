import { supabase } from "../config/supabase.js"
import jwt from "jsonwebtoken"

import { STATUS } from '../utils/constants.js';

import { verfiyPassword, verifyOTP } from '../utils/hash.js'; 

export const checkOTPExistence = async(data) => {
    try {
        const { data: responseFromOtp } = await supabase
            .from("temp_users_otp")
            .select("code, expiry_time")
            .eq("email_id", data.email_id) 
            .single()             
            .throwOnError();

        await supabase.from("temp_users_otp").delete().eq("email_id", data.email_id);
        const now = new Date();
        const expiry = new Date(responseFromOtp.expiry_time);

        if (expiry.getTime() < now.getTime()) {            
            throw {
                err: { otp: "OTP has expired. Please request a new one." },
                code: STATUS.BAD_REQUEST,
                message: "Validation Error"
            };
        }

        const isValid = await verifyOTP(String(data.code), responseFromOtp.code);

        if (!isValid) {
            throw {
                err: { otp: "Invalid verification code." },
                code: STATUS.BAD_REQUEST,
                message: "Validation Error"
            };
        }

        return true;
        
    } catch (error) {
        if (error.code === 'PGRST116') {
            throw {
                err: { otp: "No OTP found. Please request a code." },
                code: STATUS.NOT_FOUND, 
                message: "Resource Not Found"
            };
        }
        throw error;
    }
}

const signupUser = async (data) => {
    try {
        await checkOTPExistence(data);

        const hashedPassword = await hashedPassword(data.password);

        const { data: responseFromTempUsers } = await supabase
            .from("temp_users")
            .insert([
                {
                    email_id: data.email_id,
                    name: data.name,
                    password: hashedPassword,
                    rank: data.rank
                }
            ])
            .select("temp_user_id, name, rank, email_id")
            .throwOnError();

        console.log(responseFromTempUsers);
        return responseFromTempUsers;

    } catch (error) {
        console.log(error);

        if (error.code === '23505') {
            let err = {};
            const match = error.details.match(/\((.*?)\)/);
            const fieldName = match ? match[1] : 'unknown_field';

            err[fieldName] = `${fieldName.replace('_', ' ')} already exists.`;
            throw { 
                err: err, 
                code: STATUS.UNPROCESSABLE_ENTITY, 
                message: "Validation Error" 
            };
        }

        if (error.code === '23514') {
            let field = "common";
            let message = "Invalid data provided.";

            if (error.message.includes("t_users_name_check")) {
                field = "name";
                message = "Name must be between 2 and 20 characters.";
            } 
            else if (error.message.includes("t_users_rank_check")) {
                field = "rank";
                message = "Invalid rank provided.";
            }
            else if (error.message.includes("t_users_email_check")) {
                field = "email_id";
                message = "Invalid email format.";
            }
            else if (error.message.includes("t_users_password_check")) {
                field = "password";
                message = "Password must be at least 8 characters.";
            }

            throw {
                err: { [field]: message },
                code: STATUS.UNPROCESSABLE_ENTITY, 
                message: "Validation Error"
            };
        }
        throw error;
    }
}

const createToken = (user) => {
    const { user_id, email_id } = user;

    return jwt.sign(
        {
            user_id,
            email_id
        },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
    );
};

const signinUser = async (data) => {
    try {
        await checkOTPExistence(data);

        const { data: user } = await supabase
            .from("users")
            .select("user_id, name, rank, email_id, password, role, is_deleted") 
            .eq("email_id", data.email_id)
            .single()
            .throwOnError();
        
        const isPasswordValid = await verfiyPassword(data.password, user.password);

        if(user.is_deleted) {
            throw {
                err: { account_status: "Account is deactivated." },
                code: STATUS.FORBIDDEN, 
                message: "This account has been deleted. Please contact an administrator to restore access."
            };
        }

        if (!isPasswordValid) {
            throw {
                err: { password: "Incorrect password." },
                code: STATUS.UNAUTHORISED, 
                message: "Authentication Failed"
            };
        }

        const token = createToken({ 
            user_id: user.user_id, 
            email_id: user.email_id 
        });

        delete user.password;
        delete user.is_deleted;
        user["token"] = token;

        console.log(user);
        return user;

    } catch (error) {
        console.log(error);

        if (error.code === 'PGRST116') {
            throw {
                err: { email_id: "User not found. Please sign up." },
                code: STATUS.NOT_FOUND, 
                message: "Authentication Failed"
            };
        }
        throw error;
    }
}

export default {
    signupUser,
    signinUser
};