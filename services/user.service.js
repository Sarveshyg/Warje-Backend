import nodemailer from "nodemailer"
import dotenv from "dotenv"
import { supabase } from "../config/supabase.js";

import { STATUS, OTP_PURPOSE } from '../utils/constants.js';
import { errorResponseBody, successResponseBody } from "../utils/responseBody.js";
import userInterceptor from "../interceptors/user.interceptor.js";
import { hashOTP, hashPassword, verifyPassword } from "../utils/hash.js";

dotenv.config();

const updateUserService = async (data, user_id) => {
    try {
        if (!user_id) {
            throw {
                err: { user_id: "User ID is required for updates." },
                code: STATUS.BAD_REQUEST,
                message: "Validation Error"
            };
        }

        delete data.role;
        delete data.email_id;
        delete data.created_at;
        delete data.updated_at;

        if (Object.keys(data).length === 0) {
            throw {
                err: { message: "No valid fields provided for update." },
                code: STATUS.BAD_REQUEST,
                message: "Validation Error"
            };
        }

        if (data.password) {
            data.password = await hashPassword(data.password);
        }

        const { data: updatedUser } = await supabase
            .from("users")
            .update(data)
            .eq("user_id", user_id)
            .select("user_id, name, rank, email_id, role")
            .single()
            .throwOnError();

        return updatedUser;

    } catch (error) {
        console.error("Update Service Error:", error);

        if (error.code === 'PGRST116') {
            throw {
                err: { user_id: "User not found." },
                code: STATUS.NOT_FOUND,
                message: "Resource Not Found"
            };
        }

        if (error.code === '23514') {
            throw {
                code: STATUS.UNPROCESSABLE_ENTITY,
                message: "Invalid data provided for update."
            };
        }

        if (error.code === '23514') {
            let field = "common";
            let message = "Invalid data provided.";

            if (error.message.includes("users_name_check")) {
                field = "name";
                message = "Name must be between 2 and 20 characters.";
            }
            else if (error.message.includes("users_rank_check")) {
                field = "rank";
                message = "Invalid rank provided.";
            }
            else if (error.message.includes("users_email_check")) {
                field = "email_id";
                message = "Invalid email format.";
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

const generateOTP = () => {
    return String(Math.floor(1000 + Math.random() * 9000)); 
};

const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: process.env.EMAIL,
		pass: process.env.EMAIL_PASSWORD,
	},
});

const sendOtpService = async (data) => {
    try {
        const { email_id, purpose, name, password } = data;
        let upperPurpose = purpose.toUpperCase();

        await userInterceptor.isNotTempUser({ email_id });

        if (![OTP_PURPOSE.SIGNUP, OTP_PURPOSE.SIGNIN, OTP_PURPOSE.RESET_PASSWORD].includes(upperPurpose)) {
            const response = { ...errorResponseBody };
            response.err = { purpose: "Invalid purpose." };
            response.message = "Purpose must be 'SIGNUP', 'SIGNIN' or 'RESET PASSWORD'.";
            throw {
                err: response.err,
                code: STATUS.BAD_REQUEST,
                message: response.message
            };
        }

        if (upperPurpose === OTP_PURPOSE.SIGNUP && !name) {
            throw {
                err: { name: "Name is required for signup." },
                code: STATUS.BAD_REQUEST,
                message: "Validation Error"
            };
        }

        if (upperPurpose === OTP_PURPOSE.SIGNIN && !password) {
            throw {
                err: { password: "password is required for signin." },
                code: STATUS.BAD_REQUEST,
                message: "Validation Error"
            };
        }

        let userName = name || "User";

        const { data: userRecord } = await supabase
            .from("users")
            .select("name, password")
            .eq("email_id", email_id)
            .maybeSingle(); 

        // --- SCENARIO HANDLING ---

        // Case A: SIGNIN or RESET_PASSWORD -> User MUST exist
        if (upperPurpose === OTP_PURPOSE.SIGNIN || upperPurpose === OTP_PURPOSE.RESET_PASSWORD) {
            if (!userRecord) {
                throw {
                    err: { email_id: "User not found. Please sign up first." },
                    code: STATUS.NOT_FOUND,
                    message: "Resource Not Found"
                };
            }

            if(upperPurpose === OTP_PURPOSE.SIGNIN) {
                const isPasswordValid = await verifyPassword(password, userRecord.password);
                
                if (!isPasswordValid) {
                    throw {
                        err: { password: "Incorrect password." },
                        code: STATUS.UNAUTHORISED, 
                        message: "Authentication Failed"
                    };
                }
            }
            userName = userRecord.name; 
        }

        // Case B: SIGNUP -> User MUST NOT exist
        else if (upperPurpose === OTP_PURPOSE.SIGNUP) {
            if (userRecord) {
                throw {
                    err: { email_id: "User already exists. Please log in instead." },
                    code: STATUS.CONFLICT || 409,
                    message: "Conflict Error"
                };
            }
        }

        // 4. Generate OTP
        const code = generateOTP();
        const expiry_time = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        // hashed OTP
        const hashedCode = await hashOTP(code);

        // 5. Save/Update OTP in Database
        const { error: upsertError } = await supabase
            .from("temp_users_otp")
            .upsert({
                email_id,
                code: hashedCode,
                expiry_time,
                purpose: upperPurpose
            }, {
                onConflict: 'email_id'
            });

        if (upsertError) throw upsertError;

        // 6. Prepare Email Subject
        let subjectText = "Your One-Time Password";
        let displayPurpose = upperPurpose; 

        if (upperPurpose === OTP_PURPOSE.SIGNUP) {
            subjectText = "Your Verification Code for Signup";
        } else if (upperPurpose === OTP_PURPOSE.SIGNIN) {
            subjectText = "Your One-Time Password for Signin";
        } else if (upperPurpose === OTP_PURPOSE.RESET_PASSWORD) {
            displayPurpose = "RESET PASSWORD";
            subjectText = "Password Reset Verification Code";
        }

        // 7. Send Email (UPDATED WITH IMAGE & FORMAT)
        const mailOptions = {
            from: process.env.EMAIL,
            to: email_id,
            subject: subjectText,
            
            // Plain text fallback
            text: upperPurpose === OTP_PURPOSE.SIGNUP
                ? `Your verification OTP for signup is ${code}. It is valid for 5 minutes. DO NOT SHARE THIS CODE.`
                : `Your OTP for login is ${code}. It is valid for 5 minutes. DO NOT SHARE THIS CODE.`,

            // Updated HTML with Image
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border-radius: 8px; background-color: #f9f9f9; border: 1px solid #ddd;">
                
                <div style="text-align: center; background-color: #0a1941ff; padding: 15px; border-radius: 8px 8px 0 0;">
                    <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Maharashtra_Police_Insignia_India%5B1%5D-1JIZ4S6NTIdYu8aBpAKvqXl1zXn1VJ.png" alt="Sanket Darshak Logo" style="max-width: 80px;">
                    <h2 style="color: #ffffff; margin: 10px 0;">OTP Verification</h2>
                </div>
                
                <div style="background-color: #ffffff; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="font-size: 16px;">Dear <strong>${userName}</strong>,</p>
                    
                    <p>Your One-Time Password for 
                    <strong>${displayPurpose}</strong> is:</p>
                    
                    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin-top: 10px; text-align: center;">
                        <h2 style="color: #030711; font-size: 24px; margin: 0;">${code}</h2>
                        <p style="margin-top: 5px; color: red;">This OTP expires in 5 minutes.</p>
                    </div>
                
                    <p style="text-align: center; color: gray; font-size: 12px; margin-top: 20px;">
                        If you did not request this OTP, please ignore this email.<br>
                        Thank you, <br>Sanket Darshak Team
                    </p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                
                <p style="color:gray; font-size:12px; text-align: center;">This is an autogenerated message. Please do not reply to this email.</p>
            </div>
            `
        };

        await transporter.sendMail(mailOptions);

        successResponseBody.message = `OTP sent successfully to ${email_id}`;
        successResponseBody.data = { email_id, purpose: upperPurpose };

        return successResponseBody;

    } catch (error) {
        console.log(error)
        if (error.code === 'PGRST116') {
            throw {
                err: { user_id: "User not found." },
                code: STATUS.NOT_FOUND,
                message: "Resource Not Found"
            };
        }
        if (error.code === '23514') {
            let field = "common";
            let msg = "Invalid data provided.";

            if (error.message && error.message.includes("purpose")) {
                field = "purpose";
                msg = "Invalid OTP purpose. Must be LOGIN, SIGNUP, or SIGNIN.";
            }

            throw {
                err: { [field]: msg },
                code: STATUS.UNPROCESSABLE_ENTITY,
                message: "Validation Error"
            };
        }

        throw error;
    }
}

export default {
    updateUserService,
    sendOtpService
};  